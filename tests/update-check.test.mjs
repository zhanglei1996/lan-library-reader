import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  automaticUpdateChecksEnabled,
  checkForUpdate,
  compareVersions,
  updateImportance,
  updateNotice,
} from "../server/update-check.mjs";

function registryResponse(version) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ version }),
  };
}

test("compares stable versions and identifies important pre-1.0 updates", () => {
  assert.equal(compareVersions("0.6.0", "0.6.1"), -1);
  assert.equal(compareVersions("1.0.0", "1.0.0"), 0);
  assert.equal(compareVersions("2.0.0", "1.9.9"), 1);
  assert.equal(compareVersions("invalid", "1.0.0"), null);
  assert.equal(updateImportance("0.6.0", "0.7.0"), "important");
  assert.equal(updateImportance("0.6.0", "0.6.1"), "normal");
  assert.equal(updateImportance("1.4.0", "2.0.0"), "important");
});

test("automatic checks can be disabled and stay quiet outside interactive terminals", () => {
  assert.equal(automaticUpdateChecksEnabled({
    env: {},
    isTTY: true,
  }), true);
  assert.equal(automaticUpdateChecksEnabled({
    env: { LAN_READER_UPDATE_CHECK: "0" },
    isTTY: true,
  }), false);
  assert.equal(automaticUpdateChecksEnabled({
    env: { CI: "true" },
    isTTY: true,
  }), false);
  assert.equal(automaticUpdateChecksEnabled({
    env: {},
    isTTY: false,
  }), false);
});

test("caches successful update checks for 24 hours", async (t) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "lan-reader-update-"));
  const cacheFile = path.join(workspace, "update.json");
  let requests = 0;
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));

  const first = await checkForUpdate({
    currentVersion: "0.6.0",
    cacheFile,
    now: Date.UTC(2026, 6, 31),
    fetchImpl: async () => {
      requests += 1;
      return registryResponse("0.7.0");
    },
  });
  const second = await checkForUpdate({
    currentVersion: "0.6.0",
    cacheFile,
    now: Date.UTC(2026, 6, 31, 1),
    fetchImpl: async () => {
      requests += 1;
      return registryResponse("9.0.0");
    },
  });

  assert.equal(first.status, "update-available");
  assert.equal(first.cached, false);
  assert.equal(second.latestVersion, "0.7.0");
  assert.equal(second.cached, true);
  assert.equal(requests, 1);
  assert.match(updateNotice(second), /发现重要版本更新/);
});

test("network and corrupted-cache failures never throw", async (t) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "lan-reader-update-"));
  const cacheFile = path.join(workspace, "update.json");
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));
  await fs.writeFile(cacheFile, "{broken json");

  const result = await checkForUpdate({
    currentVersion: "0.6.0",
    cacheFile,
    fetchImpl: async () => {
      throw new Error("offline");
    },
  });

  assert.equal(result.status, "unavailable");
  assert.equal(updateNotice(result), null);
  assert.match(updateNotice(result, { explicit: true }), /offline/);
});
