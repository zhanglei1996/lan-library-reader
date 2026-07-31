import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import net from "node:net";
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

test("increments the port when the requested port is occupied", async (t) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "lan-reader-port-"));
  const root = path.join(workspace, "library");
  await fs.mkdir(root);
  await fs.writeFile(path.join(root, "notes.md"), "# Notes");
  let blocker;
  let result;
  let requestedPort;

  t.after(async () => {
    if (result?.server.listening) {
      await new Promise((resolve) => result.server.close(resolve));
    }
    if (blocker?.listening) {
      await new Promise((resolve) => blocker.close(resolve));
    }
    await fs.rm(workspace, { recursive: true, force: true });
  });

  for (let attempt = 0; attempt < 5 && !result; attempt += 1) {
    blocker = net.createServer();
    await new Promise((resolve, reject) => {
      blocker.once("error", reject);
      blocker.listen(0, "127.0.0.1", resolve);
    });
    requestedPort = blocker.address().port;
    if (requestedPort === 65535) {
      await new Promise((resolve) => blocker.close(resolve));
      blocker = undefined;
      continue;
    }
    try {
      result = await startReaderServer({
        root,
        host: "127.0.0.1",
        port: requestedPort,
        maxPortAttempts: 2,
        apiOnly: true,
        converter: { id: "none", available: false },
      });
    } catch (error) {
      await new Promise((resolve) => blocker.close(resolve));
      blocker = undefined;
      if (attempt === 4) throw error;
    }
  }

  assert.ok(result);
  assert.equal(result.requestedPort, requestedPort);
  assert.equal(result.port, requestedPort + 1);
  assert.equal(result.portAdjusted, true);
});

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

test("serves a complete library snapshot from one endpoint", async (t) => {
  const fixture = await startFixtureServer(t);
  const response = await fetch(`${fixture.baseUrl}/api/snapshot`);
  const snapshot = await response.json();

  assert.equal(response.status, 200);
  assert.equal(snapshot.info.name, "书架");
  assert.equal(snapshot.info.documentCount, 3);
  assert.equal(snapshot.tree.length, 3);
  assert.equal(snapshot.info.scan.scannedEntries, 3);
  assert.ok(snapshot.info.scan.visitedEntries >= 3);
  assert.equal(JSON.stringify(snapshot).includes(fixture.root), false);
});

test("returns the actionable scanner error through the API", async (t) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "lan-reader-server-limit-"));
  const root = path.join(workspace, "library");
  await fs.mkdir(root);
  await Promise.all([
    fs.writeFile(path.join(root, "one.txt"), "1"),
    fs.writeFile(path.join(root, "two.txt"), "2"),
  ]);
  const result = await startReaderServer({
    root,
    host: "127.0.0.1",
    port: 0,
    apiOnly: true,
    converter: { id: "none", available: false },
    scanOptions: { maxEntries: 1 },
  });
  t.after(async () => {
    await new Promise((resolve) => result.server.close(resolve));
    await fs.rm(workspace, { recursive: true, force: true });
  });

  const response = await fetch(`http://127.0.0.1:${result.port}/api/snapshot`);
  const payload = await response.json();

  assert.equal(response.status, 413);
  assert.match(payload.error, /\.lan-readerignore/);
});

test("supports PDF byte ranges used by browser viewers", async (t) => {
  const fixture = await startFixtureServer(t);
  const [response, suffixResponse] = await Promise.all([
    fetch(
    `${fixture.baseUrl}/api/file?path=${encodeURIComponent("资料.pdf")}`,
    { headers: { Range: "bytes=0-7" } },
    ),
    fetch(
      `${fixture.baseUrl}/api/file?path=${encodeURIComponent("资料.pdf")}`,
      { headers: { Range: "bytes=-4" } },
    ),
  ]);

  assert.equal(response.status, 206);
  assert.equal(response.headers.get("content-type"), "application/pdf");
  assert.match(response.headers.get("content-range"), /^bytes 0-7\//);
  assert.equal(await response.text(), "%PDF-1.4");
  assert.equal(suffixResponse.status, 206);
  assert.equal((await suffixResponse.arrayBuffer()).byteLength, 4);
});

test("loads custom text configuration, previews source, searches content, and downloads", async (t) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "lan-reader-configured-server-"));
  const root = path.join(workspace, "source");
  await fs.mkdir(root);
  await fs.mkdir(path.join(root, "SSelect"));
  await Promise.all([
    fs.writeFile(path.join(root, ".lan-reader.json"), JSON.stringify({
      version: 1,
      title: "源码书架",
      textPreview: { extensions: [".js"] },
    })),
    fs.writeFile(path.join(root, "readme.txt"), "hello searchable world"),
    fs.writeFile(path.join(root, "app.js"), "export function answer() { return 42; }"),
    fs.writeFile(path.join(root, "SSelect", "notes.md"), "# Select notes"),
  ]);
  const result = await startReaderServer({
    root,
    host: "127.0.0.1",
    port: 0,
    apiOnly: true,
    converter: { id: "none", available: false },
  });
  t.after(async () => {
    await new Promise((resolve) => result.server.close(resolve));
    await fs.rm(workspace, { recursive: true, force: true });
  });
  const baseUrl = `http://127.0.0.1:${result.port}`;

  const snapshot = await (await fetch(`${baseUrl}/api/snapshot`)).json();
  assert.equal(snapshot.info.name, "源码书架");
  assert.equal(snapshot.info.documentCount, 3);
  assert.deepEqual(snapshot.info.config.textPreview.extensions, [".js"]);

  const text = await (await fetch(
    `${baseUrl}/api/text?path=${encodeURIComponent("app.js")}`,
  )).json();
  assert.equal(text.language, "javascript");
  assert.match(text.content, /return 42/);

  const search = await (await fetch(`${baseUrl}/api/search?q=searchable`)).json();
  assert.equal(search.results[0].path, "readme.txt");
  assert.equal(search.results[0].type, "file");

  const directorySearch = await (await fetch(`${baseUrl}/api/search?q=sselect`)).json();
  assert.deepEqual(directorySearch.results[0], {
    type: "directory",
    path: "SSelect",
    name: "SSelect",
    snippet: "目录：SSelect",
  });

  const download = await fetch(
    `${baseUrl}/api/file?path=${encodeURIComponent("app.js")}&download=1`,
  );
  assert.match(download.headers.get("content-disposition"), /^attachment;/);
  assert.equal(await download.text(), "export function answer() { return 42; }");
});

test("invalidates the cached snapshot after a filesystem change", async (t) => {
  const fixture = await startFixtureServer(t);
  const initial = await (await fetch(`${fixture.baseUrl}/api/snapshot`)).json();
  await fs.writeFile(path.join(fixture.root, "新增.txt"), "new document");

  let updated;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    updated = await (await fetch(`${fixture.baseUrl}/api/snapshot`)).json();
    if (updated.info.documentCount === initial.info.documentCount + 1) break;
  }
  assert.equal(updated.info.documentCount, initial.info.documentCount + 1);
  assert.ok(updated.info.revision >= initial.info.revision);
});

test("protects document APIs with an access code and rate limits failures", async (t) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "lan-reader-auth-"));
  const root = path.join(workspace, "library");
  await fs.mkdir(root);
  await fs.writeFile(path.join(root, "private.md"), "# Private");
  const result = await startReaderServer({
    root,
    host: "127.0.0.1",
    port: 0,
    apiOnly: true,
    converter: { id: "none", available: false },
    accessCode: "correct horse",
  });
  t.after(async () => {
    await new Promise((resolve) => result.server.close(resolve));
    await fs.rm(workspace, { recursive: true, force: true });
  });
  const baseUrl = `http://127.0.0.1:${result.port}`;

  const status = await (await fetch(`${baseUrl}/api/auth/status`)).json();
  assert.deepEqual(status, { required: true, authenticated: false });
  assert.equal((await fetch(`${baseUrl}/api/snapshot`)).status, 401);

  const malformedCookieStatus = await fetch(`${baseUrl}/api/auth/status`, {
    headers: { Cookie: "lan_reader_session=%E0%A4%A" },
  });
  assert.equal(malformedCookieStatus.status, 200);
  assert.deepEqual(await malformedCookieStatus.json(), {
    required: true,
    authenticated: false,
  });

  const malformedCode = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: { toString: null } }),
  });
  assert.equal(malformedCode.status, 401);
  assert.deepEqual(await malformedCode.json(), { error: "访问码错误" });

  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: "correct horse" }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const protectedResponse = await fetch(`${baseUrl}/api/snapshot`, {
    headers: { Cookie: cookie },
  });
  assert.equal(protectedResponse.status, 200);

  const malformedCookieLogout = await fetch(`${baseUrl}/api/auth/logout`, {
    method: "POST",
    headers: { Cookie: "lan_reader_session=%E0%A4%A" },
  });
  assert.equal(malformedCookieLogout.status, 200);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "wrong" }),
    });
  }
  const limited = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: "wrong" }),
  });
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get("retry-after")) > 0);
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
  await fs.writeFile(path.join(fixture.root, "secret.js"), "not configured");
  const unconfiguredResponse = await fetch(
    `${fixture.baseUrl}/api/file?path=${encodeURIComponent("secret.js")}`,
  );

  assert.equal(writeResponse.status, 405);
  assert.equal((await writeResponse.json()).error, "此服务为只读模式");
  assert.equal(traversalResponse.status, 403);
  assert.equal(hiddenResponse.status, 403);
  assert.equal(unconfiguredResponse.status, 415);
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
  const healthEndpoint = `http://127.0.0.1:${result.port}/api/control/health`;
  const unauthorizedHealth = await fetch(healthEndpoint);
  const authorizedHealth = await fetch(healthEndpoint, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const unauthorized = await fetch(endpoint, { method: "POST" });
  const wrongMethod = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const authorized = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  await stopped;

  assert.equal(unauthorizedHealth.status, 404);
  assert.equal(authorizedHealth.status, 200);
  assert.equal(authorizedHealth.headers.get("x-lan-reader-control"), "1");
  assert.equal(unauthorized.status, 404);
  assert.equal(wrongMethod.status, 405);
  assert.equal(authorized.status, 202);
  assert.equal(authorized.headers.get("x-lan-reader-control"), "1");
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
