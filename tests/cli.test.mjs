import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { HELP_TEXT, parseArguments } from "../server/cli.mjs";
import { isDirectExecution } from "../server/index.mjs";

test("shows only the installed command in user-facing help", () => {
  assert.match(HELP_TEXT, /lan-reader \[文件夹\] \[选项\]/);
  assert.doesNotMatch(HELP_TEXT, /npm start/);
  assert.match(HELP_TEXT, /lan-reader list/);
  assert.match(HELP_TEXT, /--protect/);
});

test("parses the temporary access protection option", () => {
  const options = parseArguments(["/tmp/books", "--protect", "--port", "9000"]);
  assert.equal(options.root, "/tmp/books");
  assert.equal(options.protect, true);
  assert.equal(options.port, 9000);
});

test("recognizes an npm-style symlink as direct CLI execution", async (t) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "lan-reader-cli-"));
  const commandPath = path.join(workspace, "lan-reader");
  const entryPath = fileURLToPath(new URL("../server/index.mjs", import.meta.url));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));

  await fs.symlink(entryPath, commandPath);

  assert.equal(isDirectExecution(commandPath), true);
  assert.equal(isDirectExecution(path.join(workspace, "missing-command")), false);
});
