import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  LibraryError,
  buildLibraryTree,
  createLibrary,
  readMarkdown,
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
  assert.equal(documentCount, 4);
  assert.deepEqual(tree.map((node) => node.name), ["章节", "讲义.pdf", "开始.md", "演示.pptx"]);
  assert.equal(tree[0].children[0].kind, "markdown");
  assert.equal(JSON.stringify(tree).includes(".secret"), false);
  assert.equal(JSON.stringify(tree).includes("外部链接"), false);
  assert.equal(JSON.stringify(tree).includes("忽略.txt"), false);
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
