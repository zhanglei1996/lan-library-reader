import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  createControlToken,
  listInstances,
  registerInstance,
  stopAllInstances,
  stopInstances,
} from "../server/instances.mjs";
import { startReaderServer } from "../server/index.mjs";

const noOfficeConverter = {
  id: "none",
  available: false,
  supports: () => false,
};

test("stops every registered reader instance with one command", async (t) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "lan-reader-instances-"));
  const registryDirectory = path.join(workspace, "registry");
  const servers = [];
  const stoppedPromises = [];
  t.after(async () => {
    for (const server of servers) {
      if (server.listening) {
        await new Promise((resolve) => server.close(resolve));
      }
    }
    await fs.rm(workspace, { recursive: true, force: true });
  });

  for (let index = 0; index < 2; index += 1) {
    const root = path.join(workspace, `library-${index}`);
    await fs.mkdir(root);
    await fs.writeFile(path.join(root, "notes.md"), `# Library ${index}`);
    const token = createControlToken();
    let result;
    let resolveStopped;
    const stopped = new Promise((resolve) => {
      resolveStopped = resolve;
    });
    result = await startReaderServer({
      root,
      host: "127.0.0.1",
      port: 0,
      apiOnly: true,
      converter: noOfficeConverter,
      controlToken: token,
      onStop: () => {
        result.server.close(resolveStopped);
      },
    });
    servers.push(result.server);
    stoppedPromises.push(stopped);
    await registerInstance(
      {
        token,
        root,
        host: result.host,
        port: result.port,
      },
      { registryDirectory },
    );
  }

  const listed = await listInstances({ registryDirectory });
  assert.equal(listed.length, 2);
  assert.equal(listed.every((instance) => instance.status === "running"), true);

  const targeted = await stopInstances({
    registryDirectory,
    target: listed[0].port,
  });
  assert.deepEqual(targeted, { stopped: 1, stale: 0, failed: [] });

  const summary = await stopAllInstances({ registryDirectory });
  await Promise.all(stoppedPromises);

  assert.deepEqual(summary, { stopped: 1, stale: 0, failed: [] });
  await assert.rejects(fs.access(registryDirectory), { code: "ENOENT" });
  assert.equal(servers.every((server) => !server.listening), true);
});

test("reports no work when no reader instances are registered", async (t) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "lan-reader-empty-"));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));
  const summary = await stopAllInstances({
    registryDirectory: path.join(workspace, "missing"),
  });
  assert.deepEqual(summary, { stopped: 0, stale: 0, failed: [] });
});
