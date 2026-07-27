import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  LibraryError,
  buildLibraryTree,
  createLibrary,
  isIgnoredLibraryPath,
  readMarkdown,
  readText,
  resolveLibraryPath,
} from "../server/library.mjs";

async function createFixture() {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "lan-reader-library-"));
  const root = path.join(workspace, "我的学习笔记");
  const outside = path.join(workspace, "private.md");
  await fs.mkdir(path.join(root, "章节"), { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(root, "开始.md"), "# 开始\n\n欢迎阅读。"),
    fs.writeFile(path.join(root, "章节", "02-进阶.markdown"), "# 进阶"),
    fs.writeFile(path.join(root, "讲义.pdf"), "%PDF-1.4\n"),
    fs.writeFile(path.join(root, "演示.pptx"), "placeholder"),
    fs.writeFile(path.join(root, "忽略.txt"), "not listed"),
    fs.writeFile(path.join(root, ".secret.md"), "hidden"),
    fs.writeFile(outside, "outside"),
  ]);
  await fs.symlink(outside, path.join(root, "外部链接.md"));
  return { workspace, root, outside };
}

test("builds a naturally sorted document tree and ignores hidden or linked files", async (t) => {
  const fixture = await createFixture();
  t.after(() => fs.rm(fixture.workspace, { recursive: true, force: true }));
  const library = await createLibrary(fixture.root);
  const { tree, documentCount } = await buildLibraryTree(library);

  assert.equal(library.name, "我的学习笔记");
  assert.equal(documentCount, 5);
  assert.deepEqual(
    tree.map((node) => node.name),
    ["章节", "忽略.txt", "讲义.pdf", "开始.md", "演示.pptx"],
  );
  assert.equal(tree[0].children[0].kind, "markdown");
  assert.equal(JSON.stringify(tree).includes(".secret"), false);
  assert.equal(JSON.stringify(tree).includes("外部链接"), false);
  assert.equal(tree.find((node) => node.name === "忽略.txt").kind, "text");
});

test("finds supported documents deeply even when the root has no Markdown", async (t) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "lan-reader-deep-"));
  const root = path.join(workspace, "资料");
  await fs.mkdir(path.join(root, "课程", "第一章"), { recursive: true });
  await fs.mkdir(path.join(root, "空目录"), { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(root, "课程", "第一章", "讲义.pdf"), "%PDF-1.4\n"),
    fs.writeFile(path.join(root, "说明.txt"), "unsupported"),
  ]);
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));

  const library = await createLibrary(root);
  const { tree, documentCount } = await buildLibraryTree(library);

  assert.equal(documentCount, 2);
  assert.equal(tree.length, 2);
  assert.equal(tree[0].name, "课程");
  assert.equal(tree[0].children[0].children[0].name, "讲义.pdf");
  assert.equal(tree[1].name, "说明.txt");
});

test("ignores common build output directories before applying the scan limit", async (t) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "lan-reader-build-output-"));
  const root = path.join(workspace, "project");
  await fs.mkdir(path.join(root, "target", "generated"), { recursive: true });
  await fs.mkdir(path.join(root, "docs"), { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(root, "docs", "guide.md"), "# Guide"),
    ...Array.from({ length: 20 }, (_, index) =>
      fs.writeFile(path.join(root, "target", "generated", `${index}.class`), "compiled")
    ),
  ]);
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));

  const library = await createLibrary(root);
  const { tree, documentCount, scan } = await buildLibraryTree(library, { maxEntries: 5 });

  assert.equal(documentCount, 1);
  assert.equal(tree[0].name, "docs");
  assert.equal(scan.scannedEntries, 1);
  assert.equal(scan.visitedEntries, 2);
  assert.equal(scan.ignoredEntries, 1);
});

test("supports a project-level .lan-readerignore file", async (t) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "lan-reader-ignore-"));
  const root = path.join(workspace, "project");
  await fs.mkdir(path.join(root, "drafts"), { recursive: true });
  await fs.mkdir(path.join(root, "docs", "generated"), { recursive: true });
  await fs.writeFile(
    path.join(root, ".lan-readerignore"),
    "# One name applies at any depth\ndrafts\ndocs/generated/\n",
  );
  await Promise.all([
    fs.writeFile(path.join(root, "README.md"), "# Keep"),
    fs.writeFile(path.join(root, "drafts", "private.md"), "# Ignore"),
    fs.writeFile(path.join(root, "docs", "generated", "api.md"), "# Ignore"),
  ]);
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));

  const library = await createLibrary(root);
  const { tree, documentCount, scan } = await buildLibraryTree(library);

  assert.equal(documentCount, 1);
  assert.deepEqual(tree.map((node) => node.name), ["README.md"]);
  assert.equal(scan.ignoredEntries, 3);
  assert.equal(isIgnoredLibraryPath("docs/generated/new.md", ["docs/generated"]), true);
  assert.equal(isIgnoredLibraryPath("other/drafts/new.md", ["drafts"]), true);
  assert.equal(isIgnoredLibraryPath("docs/keep.md", ["drafts"]), false);
});

test("returns an actionable error when a library still exceeds the scan limit", async (t) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "lan-reader-limit-"));
  const root = path.join(workspace, "project");
  await fs.mkdir(root);
  await Promise.all(
    Array.from({ length: 4 }, (_, index) =>
      fs.writeFile(path.join(root, `${index}.txt`), "unsupported")
    ),
  );
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));

  const library = await createLibrary(root);
  await assert.rejects(
    buildLibraryTree(library, { maxEntries: 3 }),
    (error) =>
      error instanceof LibraryError
      && error.statusCode === 413
      && error.message.includes(".lan-readerignore"),
  );
});

test("unsupported files do not consume the document limit", async (t) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "lan-reader-document-limit-"));
  const root = path.join(workspace, "project");
  await fs.mkdir(root);
  await Promise.all([
    fs.writeFile(path.join(root, "guide.md"), "# Guide"),
    ...Array.from({ length: 25 }, (_, index) =>
      fs.writeFile(path.join(root, `${index}.js`), "export default true;")
    ),
  ]);
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));

  const library = await createLibrary(root);
  const { documentCount, scan, tree } = await buildLibraryTree(library, {
    maxEntries: 1,
  });

  assert.equal(documentCount, 1);
  assert.equal(scan.scannedEntries, 1);
  assert.equal(scan.visitedEntries, 26);
  assert.deepEqual(tree.map((node) => node.name), ["guide.md"]);
});

test("keeps a separate traversal safety limit for exceptionally large directories", async (t) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "lan-reader-traversal-limit-"));
  const root = path.join(workspace, "project");
  await fs.mkdir(root);
  await Promise.all(
    Array.from({ length: 4 }, (_, index) =>
      fs.writeFile(path.join(root, `${index}.js`), "export default true;")
    ),
  );
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));

  const library = await createLibrary(root);
  await assert.rejects(
    buildLibraryTree(library, { maxEntries: 1, maxVisitedEntries: 3 }),
    (error) =>
      error instanceof LibraryError
      && error.statusCode === 413
      && error.message.includes("目录检查超过 3"),
  );
});

test("reuses unchanged directory branches during an incremental scan", async (t) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "lan-reader-incremental-"));
  const root = path.join(workspace, "project");
  await fs.mkdir(path.join(root, "a"), { recursive: true });
  await fs.mkdir(path.join(root, "b"), { recursive: true });
  await fs.writeFile(path.join(root, "a", "one.md"), "# One");
  await fs.writeFile(path.join(root, "b", "two.md"), "# Two");
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));

  const library = await createLibrary(root);
  const directoryCache = new Map();
  const first = await buildLibraryTree(library, {
    directoryCache,
    dirtyDirectories: new Set([""]),
  });
  const firstBChildren = first.tree.find((node) => node.name === "b").children;
  await fs.writeFile(path.join(root, "a", "new.md"), "# New");
  const second = await buildLibraryTree(library, {
    directoryCache,
    dirtyDirectories: new Set(["", "a"]),
  });

  assert.equal(second.documentCount, 3);
  assert.equal(second.tree.find((node) => node.name === "b").children, firstBChildren);
});

test("reads Markdown metadata and content", async (t) => {
  const fixture = await createFixture();
  t.after(() => fs.rm(fixture.workspace, { recursive: true, force: true }));
  const library = await createLibrary(fixture.root);
  const document = await readMarkdown(library, "开始.md");

  assert.equal(document.name, "开始.md");
  assert.equal(document.path, "开始.md");
  assert.match(document.content, /欢迎阅读/);
  assert.match(document.modifiedAt, /^\d{4}-\d{2}-\d{2}T/);
});

test("reads TXT, configured source files, and GB18030 text without executing content", async (t) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "lan-reader-text-"));
  const root = path.join(workspace, "library");
  await fs.mkdir(root);
  await Promise.all([
    fs.writeFile(path.join(root, "notes.txt"), "<script>alert('never')</script>"),
    fs.writeFile(path.join(root, "app.js"), "export const answer = 42;"),
    fs.writeFile(path.join(root, "chinese.txt"), Buffer.from([0xd6, 0xd0, 0xce, 0xc4])),
  ]);
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));
  const library = await createLibrary(root);
  const options = { textExtensions: [".js"] };
  const { tree, documentCount } = await buildLibraryTree(library, options);

  assert.equal(documentCount, 3);
  assert.equal(tree.find((node) => node.name === "app.js").language, "javascript");
  assert.equal((await readText(library, "notes.txt")).content, "<script>alert('never')</script>");
  assert.equal(
    (await readText(library, "app.js", options)).content,
    "export const answer = 42;",
  );
  const chinese = await readText(library, "chinese.txt");
  assert.equal(chinese.content, "中文");
  assert.equal(chinese.encoding, "gb18030");
});

test("rejects binary and oversized files disguised as text", async (t) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "lan-reader-binary-"));
  const root = path.join(workspace, "library");
  await fs.mkdir(root);
  await fs.writeFile(path.join(root, "binary.txt"), Buffer.from([0, 1, 2, 3]));
  await fs.writeFile(path.join(root, "large.txt"), "a".repeat(20));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));
  const library = await createLibrary(root);

  await assert.rejects(readText(library, "binary.txt"), { statusCode: 415 });
  await assert.rejects(readText(library, "large.txt", { maxBytes: 10 }), {
    statusCode: 413,
  });
});

test("blocks traversal, hidden files, and symlinks escaping the library", async (t) => {
  const fixture = await createFixture();
  t.after(() => fs.rm(fixture.workspace, { recursive: true, force: true }));
  const library = await createLibrary(fixture.root);

  for (const unsafePath of ["../private.md", ".secret.md", "外部链接.md"]) {
    await assert.rejects(
      resolveLibraryPath(library, unsafePath),
      (error) => error instanceof LibraryError && error.statusCode === 403,
    );
  }
});
