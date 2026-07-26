import { randomBytes, timingSafeEqual } from "node:crypto";
import { promises as fs } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

export const DEFAULT_INSTANCE_DIRECTORY = path.join(
  os.homedir(),
  ".lan-library-reader",
  "instances",
);

export function createControlToken() {
  return randomBytes(32).toString("hex");
}

export function isValidControlToken(authorization, expectedToken) {
  if (!authorization?.startsWith("Bearer ") || !expectedToken) return false;
  const provided = Buffer.from(authorization.slice(7), "utf8");
  const expected = Buffer.from(expectedToken, "utf8");
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

export async function registerInstance(
  { token, root, host, port, pid = process.pid },
  { registryDirectory = DEFAULT_INSTANCE_DIRECTORY } = {},
) {
  await fs.mkdir(registryDirectory, { recursive: true, mode: 0o700 });
  await fs.chmod(registryDirectory, 0o700);
  const id = `${pid}-${randomBytes(8).toString("hex")}`;
  const filePath = path.join(registryDirectory, `${id}.json`);
  const instance = {
    id,
    pid,
    root,
    host,
    port,
    token,
    startedAt: new Date().toISOString(),
  };
  await fs.writeFile(filePath, `${JSON.stringify(instance)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  return { filePath, instance };
}

export async function unregisterInstance(filePath) {
  if (!filePath) return;
  await fs.rm(filePath, { force: true });
}

function controlHost(host) {
  if (host === "0.0.0.0" || host === "") return "127.0.0.1";
  if (host === "::" || host === "[::]") return "::1";
  return host;
}

function requestStop(instance, timeoutMs) {
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        host: controlHost(instance.host),
        port: instance.port,
        path: "/api/control/stop",
        method: "POST",
        headers: {
          Authorization: `Bearer ${instance.token}`,
          Connection: "close",
        },
      },
      (response) => {
        response.resume();
        response.once("end", () => {
          if (response.statusCode === 202) resolve();
          else reject(new Error(`停止请求返回状态 ${response.statusCode}`));
        });
      },
    );
    request.setTimeout(timeoutMs, () => {
      request.destroy(Object.assign(new Error("停止请求超时"), { code: "ETIMEDOUT" }));
    });
    request.once("error", reject);
    request.end();
  });
}

function isStaleInstanceError(error) {
  return ["ECONNREFUSED", "EHOSTUNREACH", "ENETUNREACH"]
    .includes(error?.code);
}

export async function stopAllInstances({
  registryDirectory = DEFAULT_INSTANCE_DIRECTORY,
  timeoutMs = 2_000,
} = {}) {
  let names;
  try {
    names = await fs.readdir(registryDirectory);
  } catch (error) {
    if (error.code === "ENOENT") return { stopped: 0, stale: 0, failed: [] };
    throw error;
  }

  const registrations = names.filter((name) => name.endsWith(".json"));
  const summary = { stopped: 0, stale: 0, failed: [] };

  await Promise.all(registrations.map(async (name) => {
    const filePath = path.join(registryDirectory, name);
    let instance;
    try {
      instance = JSON.parse(await fs.readFile(filePath, "utf8"));
      if (
        typeof instance.host !== "string"
        || !Number.isInteger(instance.port)
        || typeof instance.token !== "string"
      ) {
        throw Object.assign(new Error("实例登记文件无效"), { code: "ESTALE" });
      }
      await requestStop(instance, timeoutMs);
      summary.stopped += 1;
      await unregisterInstance(filePath);
    } catch (error) {
      if (error.code === "ENOENT") return;
      if (error.code === "ESTALE" || error instanceof SyntaxError || isStaleInstanceError(error)) {
        summary.stale += 1;
        await unregisterInstance(filePath);
        return;
      }
      summary.failed.push({
        root: instance?.root ?? name,
        reason: error.message,
      });
    }
  }));

  try {
    if ((await fs.readdir(registryDirectory)).length === 0) {
      await fs.rmdir(registryDirectory);
    }
  } catch {
    // Another instance may have registered while cleanup was running.
  }

  return summary;
}
