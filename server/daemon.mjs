import { fork } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { DEFAULT_STATE_DIRECTORY } from "./state.mjs";

export const DEFAULT_LOG_DIRECTORY = path.join(
  DEFAULT_STATE_DIRECTORY,
  "logs",
);

async function pruneLogs(logDirectory, keep = 30) {
  try {
    const entries = await fs.readdir(logDirectory, { withFileTypes: true });
    const logs = await Promise.all(
      entries
        .filter((entry) =>
          entry.isFile()
          && entry.name.startsWith("lan-reader-")
          && entry.name.endsWith(".log")
        )
        .map(async (entry) => {
          const filePath = path.join(logDirectory, entry.name);
          const stats = await fs.stat(filePath);
          return { filePath, modifiedAt: stats.mtimeMs };
        }),
    );
    logs.sort((left, right) => right.modifiedAt - left.modifiedAt);
    await Promise.all(
      logs.slice(keep).map((log) => fs.rm(log.filePath, { force: true })),
    );
  } catch {
    // Log cleanup must never prevent a reader from starting.
  }
}

async function createLogFile(logDirectory) {
  await fs.mkdir(logDirectory, { recursive: true, mode: 0o700 });
  await fs.chmod(logDirectory, 0o700);
  await pruneLogs(logDirectory);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const logPath = path.join(
    logDirectory,
    `lan-reader-${stamp}-${process.pid}.log`,
  );
  const handle = await fs.open(logPath, "a", 0o600);
  await handle.chmod(0o600);
  return { handle, logPath };
}

function stopChild(child) {
  try {
    child.kill("SIGTERM");
  } catch {
    // The child may already have exited.
  }
}

export async function startDaemonProcess({
  args,
  entryPath,
  cwd = process.cwd(),
  env = process.env,
  logDirectory = DEFAULT_LOG_DIRECTORY,
  timeoutMs = 15_000,
}) {
  const { handle, logPath } = await createLogFile(logDirectory);
  let child;
  try {
    child = fork(entryPath, [...args, "--foreground"], {
      cwd,
      detached: true,
      env: {
        ...env,
        LAN_READER_DAEMON_CHILD: "1",
        LAN_READER_LOG_PATH: logPath,
      },
      serialization: "json",
      stdio: ["ignore", handle.fd, handle.fd, "ipc"],
      windowsHide: true,
    });
  } finally {
    await handle.close();
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.off("message", onMessage);
      child.off("error", onError);
      child.off("exit", onExit);
      if (child.connected) child.disconnect();
      child.unref();
      callback();
    };
    const onMessage = (message) => {
      if (message?.type === "ready") {
        finish(() => resolve({
          ...message.details,
          background: true,
          logPath,
          pid: child.pid,
        }));
      } else if (message?.type === "error") {
        finish(() => reject(
          Object.assign(new Error(message.message), { logPath }),
        ));
      }
    };
    const onError = (error) => {
      finish(() => reject(Object.assign(error, { logPath })));
    };
    const onExit = (code, signal) => {
      finish(() => reject(Object.assign(
        new Error(
          `后台进程在启动完成前退出（${signal ?? `退出码 ${code}`}）`,
        ),
        { logPath },
      )));
    };
    const timer = setTimeout(() => {
      stopChild(child);
      finish(() => reject(Object.assign(
        new Error(`后台进程启动超时（${timeoutMs}ms）`),
        { logPath },
      )));
    }, timeoutMs);

    child.on("message", onMessage);
    child.once("error", onError);
    child.once("exit", onExit);
  });
}
