import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { DEFAULT_STATE_DIRECTORY } from "./state.mjs";

const PACKAGE_NAME = "lan-reader";
const REGISTRY_URL = `https://registry.npmjs.org/${PACKAGE_NAME}/latest`;
const RELEASE_URL =
  "https://github.com/zhanglei1996/lan-library-reader/releases/latest";
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1_000;
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

export const DEFAULT_UPDATE_CACHE_FILE = path.join(
  DEFAULT_STATE_DIRECTORY,
  "update-check.json",
);

function parseVersion(value) {
  if (!VERSION_PATTERN.test(value)) return null;
  const [core, prerelease = ""] = value.split("-", 2);
  return {
    core: core.split(".").map(Number),
    prerelease,
  };
}

export function compareVersions(left, right) {
  const parsedLeft = parseVersion(left);
  const parsedRight = parseVersion(right);
  if (!parsedLeft || !parsedRight) return null;
  for (let index = 0; index < 3; index += 1) {
    if (parsedLeft.core[index] !== parsedRight.core[index]) {
      return parsedLeft.core[index] > parsedRight.core[index] ? 1 : -1;
    }
  }
  if (parsedLeft.prerelease === parsedRight.prerelease) return 0;
  if (!parsedLeft.prerelease) return 1;
  if (!parsedRight.prerelease) return -1;
  return parsedLeft.prerelease.localeCompare(
    parsedRight.prerelease,
    "en",
    { numeric: true },
  );
}

export function updateImportance(currentVersion, latestVersion) {
  const current = parseVersion(currentVersion);
  const latest = parseVersion(latestVersion);
  if (!current || !latest) return "normal";
  if (latest.core[0] > current.core[0]) return "important";
  if (
    current.core[0] === 0
    && latest.core[0] === 0
    && latest.core[1] > current.core[1]
  ) {
    return "important";
  }
  return "normal";
}

function environmentFlag(value) {
  if (value === undefined) return false;
  return !["", "0", "false", "no"].includes(String(value).toLowerCase());
}

export function automaticUpdateChecksEnabled({
  env = process.env,
  isTTY = process.stdout.isTTY,
} = {}) {
  return env.LAN_READER_UPDATE_CHECK !== "0"
    && !environmentFlag(env.CI)
    && isTTY === true;
}

async function readCache(cacheFile, now, maxAgeMs) {
  try {
    const cache = JSON.parse(await fs.readFile(cacheFile, "utf8"));
    const checkedAt = Date.parse(cache.checkedAt);
    if (
      !VERSION_PATTERN.test(cache.latestVersion)
      || !Number.isFinite(checkedAt)
      || now - checkedAt < 0
      || now - checkedAt > maxAgeMs
    ) {
      return null;
    }
    return cache;
  } catch {
    return null;
  }
}

async function writeCache(cacheFile, value) {
  const directory = path.dirname(cacheFile);
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  await fs.chmod(directory, 0o700);
  const temporary = `${cacheFile}.${process.pid}-${
    randomBytes(5).toString("hex")
  }.tmp`;
  try {
    await fs.writeFile(temporary, `${JSON.stringify(value)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    await fs.rename(temporary, cacheFile);
  } finally {
    await fs.rm(temporary, { force: true });
  }
}

async function fetchLatestVersion({
  fetchImpl,
  registryUrl,
  timeoutMs,
}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  timer.unref?.();
  try {
    const response = await fetchImpl(registryUrl, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`npm Registry 返回 ${response.status}`);
    const metadata = await response.json();
    if (!VERSION_PATTERN.test(metadata.version)) {
      throw new Error("npm Registry 返回了无效版本");
    }
    return metadata.version;
  } finally {
    clearTimeout(timer);
  }
}

export async function checkForUpdate({
  currentVersion,
  cacheFile = DEFAULT_UPDATE_CACHE_FILE,
  fetchImpl = globalThis.fetch,
  registryUrl = REGISTRY_URL,
  timeoutMs = 1_200,
  maxAgeMs = CACHE_MAX_AGE_MS,
  force = false,
  now = Date.now(),
} = {}) {
  if (!force) {
    const cached = await readCache(cacheFile, now, maxAgeMs);
    if (cached) {
      return updateResult(currentVersion, cached.latestVersion, {
        cached: true,
      });
    }
  }

  try {
    const latestVersion = await fetchLatestVersion({
      fetchImpl,
      registryUrl,
      timeoutMs,
    });
    try {
      await writeCache(cacheFile, {
        latestVersion,
        checkedAt: new Date(now).toISOString(),
      });
    } catch {
      // A read-only home directory must not break the CLI.
    }
    return updateResult(currentVersion, latestVersion, { cached: false });
  } catch (error) {
    return {
      status: "unavailable",
      currentVersion,
      error: error.message,
    };
  }
}

function updateResult(currentVersion, latestVersion, { cached }) {
  const comparison = compareVersions(currentVersion, latestVersion);
  if (comparison === null) {
    return {
      status: "unavailable",
      currentVersion,
      error: "无法比较版本",
    };
  }
  return {
    status: comparison < 0 ? "update-available" : "current",
    currentVersion,
    latestVersion,
    importance: updateImportance(currentVersion, latestVersion),
    cached,
    releaseUrl: RELEASE_URL,
  };
}

export function updateNotice(result, { explicit = false } = {}) {
  if (result.status === "unavailable") {
    return explicit
      ? `无法检查更新：${result.error}`
      : null;
  }
  if (result.status === "current") {
    return explicit
      ? `当前版本：${result.currentVersion}\n最新版本：${result.latestVersion}\n已是最新版本。`
      : null;
  }
  const important = result.importance === "important";
  return [
    important ? "发现重要版本更新" : "发现新版本",
    `当前版本：${result.currentVersion}`,
    `最新版本：${result.latestVersion}`,
    ...(important ? ["此版本可能包含重要变化，请先阅读发布说明。"] : []),
    "更新命令：npm install -g lan-reader@latest",
    `发布说明：${result.releaseUrl}`,
  ].join("\n");
}
