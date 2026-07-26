#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";

const dryRun = process.argv.slice(2).includes("--dry-run");
const packageJson = JSON.parse(await fs.readFile(new URL("../package.json", import.meta.url), "utf8"));
const releaseTag = `v${packageJson.version}`;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
  });
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`${command} ${args.join(" ")} 执行失败`);
  }
  return result;
}

function gitStatus() {
  return run("git", ["status", "--porcelain"], { capture: true }).stdout.trim();
}

if (!dryRun) {
  const branch = run("git", ["branch", "--show-current"], { capture: true }).stdout.trim();
  if (branch !== "main") {
    throw new Error(`正式发布必须从 main 分支执行，当前分支是 ${branch || "未知"}`);
  }
  if (gitStatus()) {
    throw new Error("正式发布前工作区必须保持干净");
  }
  const existingTag = run("git", ["rev-parse", "--verify", `refs/tags/${releaseTag}`], {
    capture: true,
    allowFailure: true,
  });
  if (existingTag.status === 0) {
    throw new Error(`Git 标签 ${releaseTag} 已经存在`);
  }
  run("npm", ["whoami"]);
}

console.log(`\n检查 ${packageJson.name}@${packageJson.version}...`);
run("npm", ["run", "release:check"]);
run("npm", ["pack", "--dry-run"]);

if (!dryRun && gitStatus()) {
  throw new Error("构建产物发生了变化，请先提交生成的 dist 文件再发布");
}

if (dryRun) {
  console.log("\n发布演练通过，没有上传任何内容。");
  process.exit(0);
}

const published = run(
  "npm",
  ["view", `${packageJson.name}@${packageJson.version}`, "version", "--json"],
  { capture: true, allowFailure: true },
);
if (published.status === 0) {
  throw new Error(`${packageJson.name}@${packageJson.version} 已经发布，不能覆盖已有版本`);
}
if (!published.stderr.includes("E404")) {
  process.stderr.write(published.stderr);
  throw new Error("无法确认目标版本是否已存在");
}

run("npm", ["publish", "--access", "public"]);
run("git", ["tag", "-a", releaseTag, "-m", `${packageJson.name} ${packageJson.version}`]);
run("git", ["push", "origin", releaseTag]);
console.log(`\n已发布 ${packageJson.name}@${packageJson.version}，并推送标签 ${releaseTag}`);
