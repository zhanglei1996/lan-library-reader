import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createMinimalPdf } from "../scripts/generate-demo-pdf.mjs";
import { startReaderServer } from "../server/index.mjs";

async function startFixtureServer(t, converter = { id: "none", available: false }) {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "lan-reader-server-"));
  const root = path.join(workspace, "书架");
  await fs.mkdir(root);
  await Promise.all([
    fs.writeFile(path.join(root, "阅读.md"), "# 阅读\n\n只读服务。"),
    createMinimalPdf(path.join(root, "资料.pdf"), "PDF fixture"),
    fs.writeFile(path.join(root, "课程.docx"), "office"),
    fs.writeFile(path.join(root, ".token"), "do not expose"),
  ]);

  const result = await startReaderServer({
    root,
    host: "127.0.0.1",
    port: 0,
    apiOnly: true,
    converter,
  });
  t.after(async () => {
    await new Promise((resolve) => result.server.close(resolve));
    await fs.rm(workspace, { recursive: true, force: true });
  });
  return { ...result, workspace, root, baseUrl: `http://127.0.0.1:${result.port}` };
}

test("serves library metadata, tree, and Markdown without exposing the root path", async (t) => {
  const fixture = await startFixtureServer(t);
  const [infoResponse, treeResponse, markdownResponse] = await Promise.all([
    fetch(`${fixture.baseUrl}/api/library`),
    fetch(`${fixture.baseUrl}/api/tree`),
    fetch(`${fixture.baseUrl}/api/markdown?path=${encodeURIComponent("阅读.md")}`),
  ]);

  assert.equal(infoResponse.status, 200);
  const info = await infoResponse.json();
  assert.equal(info.name, "书架");
  assert.equal(info.documentCount, 3);
  assert.equal(info.capabilities.officePreview, false);
  assert.equal(JSON.stringify(info).includes(fixture.root), false);

  const tree = await treeResponse.json();
  assert.equal(tree.length, 3);
  assert.equal((await markdownResponse.json()).content, "# 阅读\n\n只读服务。");
  assert.equal(markdownResponse.headers.get("x-content-type-options"), "nosniff");
  assert.match(markdownResponse.headers.get("content-security-policy"), /default-src 'self'/);
});

test("supports PDF byte ranges used by browser viewers", async (t) => {
  const fixture = await startFixtureServer(t);
  const response = await fetch(
    `${fixture.baseUrl}/api/file?path=${encodeURIComponent("资料.pdf")}`,
    { headers: { Range: "bytes=0-7" } },
  );

  assert.equal(response.status, 206);
  assert.equal(response.headers.get("content-type"), "application/pdf");
  assert.match(response.headers.get("content-range"), /^bytes 0-7\//);
  assert.equal(await response.text(), "%PDF-1.4");
});

test("rejects writes and unsafe paths", async (t) => {
  const fixture = await startFixtureServer(t);
  const writeResponse = await fetch(`${fixture.baseUrl}/api/tree`, { method: "POST" });
  const traversalResponse = await fetch(
    `${fixture.baseUrl}/api/markdown?path=${encodeURIComponent("../outside.md")}`,
  );
  const hiddenResponse = await fetch(
    `${fixture.baseUrl}/api/file?path=${encodeURIComponent(".token")}`,
  );

  assert.equal(writeResponse.status, 405);
  assert.equal((await writeResponse.json()).error, "此服务为只读模式");
  assert.equal(traversalResponse.status, 403);
  assert.equal(hiddenResponse.status, 403);
});

test("protects the graceful stop endpoint with a secret token", async (t) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "lan-reader-control-"));
  const root = path.join(workspace, "library");
  await fs.mkdir(root);
  await fs.writeFile(path.join(root, "notes.md"), "# Notes");
  let resolveStopped;
  const stopped = new Promise((resolve) => {
    resolveStopped = resolve;
  });
  const token = "test-control-token";
  const result = await startReaderServer({
    root,
    host: "127.0.0.1",
    port: 0,
    apiOnly: true,
    converter: { id: "none", available: false },
    controlToken: token,
    onStop: resolveStopped,
  });
  t.after(async () => {
    if (result.server.listening) {
      await new Promise((resolve) => result.server.close(resolve));
    }
    await fs.rm(workspace, { recursive: true, force: true });
  });

  const endpoint = `http://127.0.0.1:${result.port}/api/control/stop`;
  const unauthorized = await fetch(endpoint, { method: "POST" });
  const wrongMethod = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const authorized = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  await stopped;

  assert.equal(unauthorized.status, 404);
  assert.equal(wrongMethod.status, 405);
  assert.equal(authorized.status, 202);
  assert.deepEqual(await authorized.json(), { stopping: true });
});

test("uses the Office converter extension when one is available", async (t) => {
  let convertedSource;
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "lan-reader-converter-"));
  const convertedPdf = path.join(workspace, "converted.pdf");
  await fs.writeFile(convertedPdf, "%PDF-1.4\nconverted");
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));

  const converter = {
    id: "test-converter",
    available: true,
    supports: (filePath) => filePath.endsWith(".docx"),
    convert: async (filePath) => {
      convertedSource = filePath;
      return convertedPdf;
    },
  };
  const fixture = await startFixtureServer(t, converter);
  const response = await fetch(
    `${fixture.baseUrl}/api/office?path=${encodeURIComponent("课程.docx")}`,
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/pdf");
  assert.equal(await response.text(), "%PDF-1.4\nconverted");
  assert.equal(convertedSource, await fs.realpath(path.join(fixture.root, "课程.docx")));
});
