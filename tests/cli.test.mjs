import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { HELP_TEXT, VERSION, parseArguments } from "../server/cli.mjs";
import { isDirectExecution } from "../server/index.mjs";

test("shows only the installed command in user-facing help", () => {
  assert.match(HELP_TEXT, /lan-reader \[文件夹\] \[选项\]/);
  assert.doesNotMatch(HELP_TEXT, /npm start/);
  assert.match(HELP_TEXT, /lan-reader list/);
  assert.match(HELP_TEXT, /lan-reader version/);
  assert.match(HELP_TEXT, /lan-reader help/);
  assert.match(HELP_TEXT, /lan-reader check-update/);
  assert.match(HELP_TEXT, /--protect/);
  assert.match(HELP_TEXT, /--foreground/);
});

test("supports version flags and reports the installed package version", () => {
  assert.equal(parseArguments(["--version"]).version, true);
  assert.equal(parseArguments(["-v"]).version, true);

  const entryPath = fileURLToPath(new URL("../server/index.mjs", import.meta.url));
  for (const argument of ["--version", "-v", "version"]) {
    const result = spawnSync(process.execPath, [entryPath, argument], {
      encoding: "utf8",
    });
    assert.equal(result.status, 0);
    assert.equal(result.stdout.trim(), `lan-reader ${VERSION}`);
    assert.equal(result.stderr, "");
  }
});

test("supports help as a flag and a command", () => {
  const entryPath = fileURLToPath(new URL("../server/index.mjs", import.meta.url));
  for (const argument of ["--help", "-h", "help"]) {
    const result = spawnSync(process.execPath, [entryPath, argument], {
      encoding: "utf8",
    });
    assert.equal(result.status, 0);
    assert.match(result.stdout, /局域网书架/);
    assert.match(result.stdout, /lan-reader version/);
    assert.equal(result.stderr, "");
  }
});

test("parses the temporary access protection option", () => {
  const options = parseArguments([
    "/tmp/books",
    "--protect",
    "--foreground",
    "--port",
    "9000",
  ]);
  assert.equal(options.root, "/tmp/books");
  assert.equal(options.protect, true);
  assert.equal(options.foreground, true);
  assert.equal(options.port, 9000);
});

test("rejects extra command arguments instead of silently ignoring them", () => {
  const entryPath = fileURLToPath(new URL("../server/index.mjs", import.meta.url));
  for (const command of ["help", "version", "list", "check-update"]) {
    const result = spawnSync(process.execPath, [entryPath, command, "extra"], {
      encoding: "utf8",
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, new RegExp(`${command} 命令不接受额外参数`));
  }
});

test("rejects missing option values and extra folders", () => {
  assert.throws(
    () => parseArguments(["--host", "--protect"]),
    /参数 --host 缺少值/,
  );
  assert.throws(
    () => parseArguments(["--root"]),
    /参数 --root 缺少值/,
  );
  assert.throws(
    () => parseArguments(["notes", "archive"]),
    /只能指定一个要阅读的文件夹/,
  );
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
