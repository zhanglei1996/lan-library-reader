import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const entryPath = fileURLToPath(new URL("../server/index.mjs", import.meta.url));

function runCli(args, env) {
  return spawnSync(process.execPath, [entryPath, ...args], {
    encoding: "utf8",
    env,
    timeout: 15_000,
  });
}

test("starts in the background and remains manageable after the launcher exits", async (t) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "lan-reader-daemon-"));
  const library = path.join(workspace, "library");
  const stateDirectory = path.join(workspace, "state");
  const env = {
    ...process.env,
    LAN_READER_STATE_DIR: stateDirectory,
    LAN_READER_UPDATE_CHECK: "0",
  };
  await fs.mkdir(library);
  await fs.writeFile(path.join(library, "README.md"), "# Background reader\n");
  t.after(() => {
    runCli(["stop"], env);
    return fs.rm(workspace, { recursive: true, force: true });
  });

  const started = runCli([library, "--host", "127.0.0.1", "--port", "0"], env);
  assert.equal(started.status, 0, started.stderr);
  assert.match(started.stdout, /已在后台启动/);
  assert.match(started.stdout, /现在可以关闭当前终端/);
  const logPath = /^日志：(.+)$/m.exec(started.stdout)?.[1];
  assert.ok(logPath);
  await fs.access(logPath);

  const listed = runCli(["list"], env);
  assert.equal(listed.status, 0, listed.stderr);
  assert.match(listed.stdout, new RegExp(library.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(listed.stdout, /后台/);
  assert.match(listed.stdout, /PID \d+/);

  const stopped = runCli(["stop"], env);
  assert.equal(stopped.status, 0, stopped.stderr);
  assert.match(stopped.stdout, /已停止 1 个局域网书架/);

  const empty = runCli(["list"], env);
  assert.equal(empty.status, 0, empty.stderr);
  assert.match(empty.stdout, /当前没有运行中的局域网书架/);
});
