import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { loadReaderConfig, publicReaderConfig } from "../server/config.mjs";
import { LibraryError } from "../server/library.mjs";

async function fixture(t, contents) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "lan-reader-config-"));
  if (contents !== undefined) {
    await fs.writeFile(path.join(root, ".lan-reader.json"), contents);
  }
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}

test("loads defaults when no project configuration exists", async (t) => {
  const config = await loadReaderConfig(await fixture(t));
  assert.equal(config.version, 1);
  assert.equal(config.features.download, true);
  assert.deepEqual(config.textPreview.extensions, []);
});

test("normalizes custom text extensions and reports unknown keys", async (t) => {
  const root = await fixture(t, JSON.stringify({
    version: 1,
    title: " Source Shelf ",
    textPreview: {
      extensions: [".JS", ".js", ".sql", ".md", ".png"],
      maxBytes: 4096,
      extra: true,
    },
    features: { copy: false },
    unknown: "ignored",
  }));
  const config = await loadReaderConfig(root);
  const publicConfig = publicReaderConfig(config);

  assert.equal(config.title, "Source Shelf");
  assert.deepEqual(config.textPreview.extensions, [".js", ".sql"]);
  assert.equal(config.features.copy, false);
  assert.equal(config.features.download, true);
  assert.equal(config.warnings.length, 2);
  assert.deepEqual(publicConfig.textPreview.extensions, [".js", ".sql"]);
});

test("rejects malformed, future, and unsafe configuration", async (t) => {
  const malformed = await fixture(t, "{invalid");
  await assert.rejects(
    loadReaderConfig(malformed),
    (error) => error instanceof LibraryError && error.message.includes("JSON 格式错误"),
  );

  const future = await fixture(t, JSON.stringify({ version: 99 }));
  await assert.rejects(loadReaderConfig(future), /无法识别/);

  const invalidExtension = await fixture(t, JSON.stringify({
    version: 1,
    textPreview: { extensions: ["../secret"] },
  }));
  await assert.rejects(loadReaderConfig(invalidExtension), /无效的文本扩展名/);
});
