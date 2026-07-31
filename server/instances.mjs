import { randomBytes, timingSafeEqual } from "node:crypto";
import { promises as fs } from "node:fs";
import http from "node:http";
import path from "node:path";
import { DEFAULT_STATE_DIRECTORY } from "./state.mjs";

const CONTROL_PROTOCOL_VERSION = 1;
const CONTROL_RESPONSE_HEADER = "x-lan-reader-control";

export const DEFAULT_INSTANCE_DIRECTORY = path.join(
  DEFAULT_STATE_DIRECTORY,
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
  {
    token,
    root,
    host,
    port,
    pid = process.pid,
    background = false,
    logPath,
  },
  { registryDirectory = DEFAULT_INSTANCE_DIRECTORY } = {},
) {
  await fs.mkdir(registryDirectory, { recursive: true, mode: 0o700 });
  await fs.chmod(registryDirectory, 0o700);
  const id = `${pid}-${randomBytes(8).toString("hex")}`;
  const filePath = path.join(registryDirectory, `${id}.json`);
  const instance = {
    id,
    pid,
    protocolVersion: CONTROL_PROTOCOL_VERSION,
    root,
    host,
    port,
    token,
    background,
    ...(logPath ? { logPath } : {}),
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
  const authenticatedControl = instance.protocolVersion >= CONTROL_PROTOCOL_VERSION;
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
          if (
            response.statusCode === 202
            && (!authenticatedControl || response.headers[CONTROL_RESPONSE_HEADER] === "1")
          ) {
            resolve();
          } else {
            reject(Object.assign(
              new Error(`停止请求返回状态 ${response.statusCode}`),
              authenticatedControl ? { code: "ESTALE" } : {},
            ));
          }
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

function requestHealth(instance, timeoutMs) {
  const authenticatedControl = instance.protocolVersion >= CONTROL_PROTOCOL_VERSION;
  return new Promise((resolve, reject) => {
    const request = http.get(
      {
        host: controlHost(instance.host),
        port: instance.port,
        path: authenticatedControl ? "/api/control/health" : "/api/health",
        headers: {
          Connection: "close",
          ...(authenticatedControl
            ? { Authorization: `Bearer ${instance.token}` }
            : {}),
        },
      },
      (response) => {
        response.resume();
        response.once("end", () => {
          if (
            response.statusCode === 200
            && (!authenticatedControl || response.headers[CONTROL_RESPONSE_HEADER] === "1")
          ) {
            resolve();
          } else {
            reject(Object.assign(
              new Error(`健康检查返回状态 ${response.statusCode}`),
              authenticatedControl ? { code: "ESTALE" } : {},
            ));
          }
        });
      },
    );
    request.setTimeout(timeoutMs, () => {
      request.destroy(Object.assign(new Error("健康检查超时"), { code: "ETIMEDOUT" }));
    });
    request.once("error", reject);
  });
}

function isStaleInstanceError(error) {
  return ["ECONNREFUSED", "EHOSTUNREACH", "ENETUNREACH"]
    .includes(error?.code);
}

async function registrationNames(registryDirectory) {
  try {
    return (await fs.readdir(registryDirectory)).filter((name) => name.endsWith(".json"));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function readRegistration(filePath) {
  const instance = JSON.parse(await fs.readFile(filePath, "utf8"));
  if (
    typeof instance.host !== "string"
    || !Number.isInteger(instance.port)
    || typeof instance.token !== "string"
    || typeof instance.root !== "string"
    || (
      instance.protocolVersion !== undefined
      && (
        !Number.isInteger(instance.protocolVersion)
        || instance.protocolVersion < CONTROL_PROTOCOL_VERSION
      )
    )
  ) {
    throw Object.assign(new Error("实例登记文件无效"), { code: "ESTALE" });
  }
  return instance;
}

export async function listInstances({
  registryDirectory = DEFAULT_INSTANCE_DIRECTORY,
  timeoutMs = 1_000,
} = {}) {
  const names = await registrationNames(registryDirectory);
  const instances = [];
  await Promise.all(names.map(async (name) => {
    const filePath = path.join(registryDirectory, name);
    try {
      const instance = await readRegistration(filePath);
      await requestHealth(instance, timeoutMs);
      instances.push({ ...instance, status: "running" });
    } catch (error) {
      if (
        error.code === "ENOENT"
        || error.code === "ESTALE"
        || error instanceof SyntaxError
        || isStaleInstanceError(error)
      ) {
        await unregisterInstance(filePath);
        return;
      }
      instances.push({
        id: name.replace(/\.json$/, ""),
        root: name,
        status: "unknown",
        error: error.message,
      });
    }
  }));
  return instances.sort((left, right) =>
    String(left.startedAt ?? "").localeCompare(String(right.startedAt ?? ""))
  );
}

export async function stopInstances({
  registryDirectory = DEFAULT_INSTANCE_DIRECTORY,
  timeoutMs = 2_000,
  target,
} = {}) {
  const registrations = await registrationNames(registryDirectory);
  const summary = { stopped: 0, stale: 0, failed: [] };

  await Promise.all(registrations.map(async (name) => {
    const filePath = path.join(registryDirectory, name);
    let instance;
    try {
      instance = await readRegistration(filePath);
      if (target !== undefined) {
        const portTarget = /^\d+$/.test(String(target)) ? Number(target) : null;
        const matches = portTarget !== null
          ? instance.port === portTarget
          : path.resolve(instance.root) === path.resolve(String(target));
        if (!matches) return;
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

export async function stopAllInstances(options = {}) {
  return stopInstances(options);
}
