import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArguments } from "../server/cli.mjs";
import { startReaderServer } from "../server/index.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const options = parseArguments(process.argv.slice(2), { port: 4173 });
const api = await startReaderServer({ ...options, apiOnly: true });

const viteEntry = path.join(projectRoot, "node_modules", "vite", "bin", "vite.js");
const web = spawn(process.execPath, [viteEntry, "--host", "0.0.0.0", "--port", "3000"], {
  cwd: projectRoot,
  stdio: "inherit",
});

function stop() {
  api.server.close();
  web.kill("SIGTERM");
}

process.on("SIGINT", stop);
process.on("SIGTERM", stop);
web.on("exit", (code) => {
  api.server.close();
  process.exitCode = code ?? 0;
});

console.log(`本地文档接口：http://127.0.0.1:${api.port}`);
