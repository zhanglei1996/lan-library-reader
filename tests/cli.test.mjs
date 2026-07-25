import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { isDirectExecution } from "../server/index.mjs";

test("recognizes an npm-style symlink as direct CLI execution", async (t) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "lan-reader-cli-"));
  const commandPath = path.join(workspace, "lan-reader");
  const entryPath = fileURLToPath(new URL("../server/index.mjs", import.meta.url));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));

  await fs.symlink(entryPath, commandPath);

  assert.equal(isDirectExecution(commandPath), true);
  assert.equal(isDirectExecution(path.join(workspace, "missing-command")), false);
});
