#!/usr/bin/env node
import { createReadStream, rmSync } from "node:fs";
import { promises as fs } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { HELP_TEXT, parseArguments } from "./cli.mjs";
import { createLibreOfficeConverter } from "./converters/libreoffice.mjs";
import {
  createControlToken,
  isValidControlToken,
  registerInstance,
  stopAllInstances,
  unregisterInstance,
} from "./instances.mjs";
import {
  LibraryError,
  buildLibraryTree,
  createLibrary,
  getLibraryFile,
  readMarkdown,
} from "./library.mjs";

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultDistDirectory = path.resolve(moduleDirectory, "../dist");

const MIME_TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
  [".pdf", "application/pdf"],
  [".doc", "application/msword"],
  [".docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  [".ppt", "application/vnd.ms-powerpoint"],
  [".pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".gif", "image/gif"],
  [".webp", "image/webp"],
  [".avif", "image/avif"],
  [".bmp", "image/bmp"],
  [".svg", "image/svg+xml"],
  [".ico", "image/x-icon"],
  [".woff2", "font/woff2"],
]);

function setSecurityHeaders(response, { file = false } = {}) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Frame-Options", "SAMEORIGIN");
  response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  response.setHeader(
    "Content-Security-Policy",
    file
      ? "default-src 'none'; sandbox"
      : "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-src 'self' blob:; object-src 'self'; base-uri 'none'; form-action 'none'",
  );
}

function sendJson(response, statusCode, value) {
  const body = JSON.stringify(value);
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  response.end(body);
}

function sendText(response, statusCode, value) {
  response.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Content-Length": Buffer.byteLength(value),
    "Cache-Control": "no-store",
  });
  response.end(value);
}

function contentDisposition(name, type = "inline") {
  const fallback = name.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_");
  return `${type}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

function streamFile(request, response, file, { name, contentType, cache = "no-store" }) {
  const total = file.stats.size;
  const range = request.headers.range;
  response.setHeader("Accept-Ranges", "bytes");
  response.setHeader("Cache-Control", cache);
  response.setHeader("Content-Type", contentType);
  if (name) response.setHeader("Content-Disposition", contentDisposition(name));

  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match) {
      response.writeHead(416, { "Content-Range": `bytes */${total}` });
      response.end();
      return;
    }
    const start = match[1] ? Number(match[1]) : 0;
    const end = match[2] ? Number(match[2]) : total - 1;
    if (start > end || end >= total) {
      response.writeHead(416, { "Content-Range": `bytes */${total}` });
      response.end();
      return;
    }
    response.writeHead(206, {
      "Content-Range": `bytes ${start}-${end}/${total}`,
      "Content-Length": end - start + 1,
    });
    if (request.method === "HEAD") response.end();
    else createReadStream(file.absolutePath, { start, end }).pipe(response);
    return;
  }

  response.writeHead(200, { "Content-Length": total });
  if (request.method === "HEAD") response.end();
  else createReadStream(file.absolutePath).pipe(response);
}

async function serveStatic(request, response, url, distDirectory) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(url.pathname);
  } catch {
    throw new LibraryError("无效的网址", 400);
  }
  const requested = decodedPath === "/" ? "index.html" : decodedPath.replace(/^\/+/, "");
  let target = path.resolve(distDirectory, requested);
  const relative = path.relative(distDirectory, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new LibraryError("不能访问应用目录之外的文件", 403);
  }

  try {
    const stats = await fs.stat(target);
    if (!stats.isFile()) throw new Error("not a file");
    streamFile(request, response, { absolutePath: target, stats }, {
      contentType: MIME_TYPES.get(path.extname(target).toLocaleLowerCase())
        ?? "application/octet-stream",
      cache: target.endsWith("index.html") ? "no-cache" : "public, max-age=31536000, immutable",
    });
  } catch {
    target = path.join(distDirectory, "index.html");
    const stats = await fs.stat(target);
    streamFile(request, response, { absolutePath: target, stats }, {
      contentType: "text/html; charset=utf-8",
      cache: "no-cache",
    });
  }
}

export async function createReaderServer({
  root = process.cwd(),
  distDirectory = defaultDistDirectory,
  apiOnly = false,
  converter,
  controlToken,
  onStop,
} = {}) {
  const library = await createLibrary(root);
  const officeConverter = converter ?? await createLibreOfficeConverter();

  return http.createServer(async (request, response) => {
    setSecurityHeaders(response);
    try {
      if (!request.url) throw new LibraryError("无效的请求");
      const url = new URL(request.url, "http://localhost");
      const isApi = url.pathname.startsWith("/api/");

      if (url.pathname === "/api/control/stop") {
        if (request.method !== "POST") {
          response.setHeader("Allow", "POST");
          sendJson(response, 405, { error: "停止接口只接受 POST 请求" });
          return;
        }
        if (
          typeof onStop !== "function"
          || !isValidControlToken(request.headers.authorization, controlToken)
        ) {
          sendJson(response, 404, { error: "接口不存在" });
          return;
        }
        sendJson(response, 202, { stopping: true });
        setImmediate(() => onStop());
        return;
      }

      if (request.method !== "GET" && request.method !== "HEAD") {
        response.setHeader("Allow", "GET, HEAD");
        sendJson(response, 405, { error: "此服务为只读模式" });
        return;
      }

      if (url.pathname === "/api/health") {
        sendJson(response, 200, { status: "ok" });
        return;
      }

      if (url.pathname === "/api/library") {
        const { documentCount } = await buildLibraryTree(library);
        sendJson(response, 200, {
          name: library.name,
          documentCount,
          capabilities: {
            officePreview: officeConverter.available,
            officeProvider: officeConverter.available ? officeConverter.id : null,
          },
        });
        return;
      }

      if (url.pathname === "/api/tree") {
        const { tree } = await buildLibraryTree(library);
        sendJson(response, 200, tree);
        return;
      }

      if (url.pathname === "/api/markdown") {
        const document = await readMarkdown(library, url.searchParams.get("path") ?? "");
        sendJson(response, 200, document);
        return;
      }

      if (url.pathname === "/api/file") {
        const file = await getLibraryFile(library, url.searchParams.get("path") ?? "");
        setSecurityHeaders(response, { file: true });
        streamFile(request, response, file, {
          name: file.name,
          contentType: MIME_TYPES.get(path.extname(file.name).toLocaleLowerCase())
            ?? "application/octet-stream",
        });
        return;
      }

      if (url.pathname === "/api/office") {
        if (!officeConverter.available) {
          sendJson(response, 501, { error: "需要安装 LibreOffice 才能预览 Office 文档" });
          return;
        }
        const source = await getLibraryFile(library, url.searchParams.get("path") ?? "");
        if (!officeConverter.supports(source.absolutePath)) {
          throw new LibraryError("该文件不支持 Office 转换", 415);
        }
        const convertedPath = await officeConverter.convert(source.absolutePath);
        const stats = await fs.stat(convertedPath);
        setSecurityHeaders(response, { file: true });
        streamFile(
          request,
          response,
          { absolutePath: convertedPath, stats },
          { name: `${path.parse(source.name).name}.pdf`, contentType: "application/pdf" },
        );
        return;
      }

      if (isApi || apiOnly) {
        sendJson(response, 404, { error: "接口不存在" });
        return;
      }

      await serveStatic(request, response, url, distDirectory);
    } catch (error) {
      if (response.headersSent) {
        response.destroy();
        return;
      }
      const statusCode = error instanceof LibraryError ? error.statusCode : 500;
      const message = error instanceof LibraryError ? error.message : "服务暂时无法处理该请求";
      if (request.url?.startsWith("/api/")) sendJson(response, statusCode, { error: message });
      else sendText(response, statusCode, message);
      if (!(error instanceof LibraryError)) console.error(error);
    }
  });
}

function localAddresses(port) {
  const addresses = [];
  for (const interfaces of Object.values(os.networkInterfaces())) {
    for (const entry of interfaces ?? []) {
      if (entry.family === "IPv4" && !entry.internal) {
        addresses.push(`http://${entry.address}:${port}`);
      }
    }
  }
  return addresses;
}

export async function startReaderServer(options = {}) {
  const server = await createReaderServer(options);
  const host = options.host ?? "0.0.0.0";
  const requestedPort = options.port ?? 8080;
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(requestedPort, host, resolve);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : requestedPort;
  return { server, host, port, urls: localAddresses(port) };
}

async function main() {
  const rawArguments = process.argv.slice(2);
  if (rawArguments[0] === "stop") {
    const summary = await stopAllInstances();
    if (summary.stopped === 0 && summary.stale === 0 && summary.failed.length === 0) {
      console.log("当前没有运行中的局域网书架。");
      return;
    }
    if (summary.stopped > 0) {
      console.log(`已停止 ${summary.stopped} 个局域网书架。`);
    }
    if (summary.stale > 0) {
      console.log(`已清理 ${summary.stale} 条失效的实例记录。`);
    }
    if (summary.failed.length > 0) {
      for (const failure of summary.failed) {
        console.error(`无法停止 ${failure.root}：${failure.reason}`);
      }
      process.exitCode = 1;
    }
    return;
  }

  let options;
  try {
    options = parseArguments(rawArguments);
  } catch (error) {
    console.error(error.message);
    console.error("\n运行 lan-reader --help 查看用法。");
    process.exitCode = 1;
    return;
  }

  if (options.help) {
    console.log(HELP_TEXT);
    return;
  }

  try {
    await fs.access(defaultDistDirectory);
  } catch {
    console.error("尚未生成网页资源，请先运行 npm run build。");
    process.exitCode = 1;
    return;
  }

  const controlToken = createControlToken();
  let result;
  let registration;
  let stopping = false;

  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    try {
      await unregisterInstance(registration?.filePath);
    } catch (error) {
      console.error(`清理实例记录失败：${error.message}`);
    }
    await new Promise((resolve) => result.server.close(resolve));
    process.exit(0);
  };

  result = await startReaderServer({
    ...options,
    controlToken,
    onStop: () => void shutdown(),
  });
  try {
    registration = await registerInstance({
      token: controlToken,
      root: path.resolve(options.root),
      host: result.host,
      port: result.port,
    });
  } catch (error) {
    result.server.close();
    throw error;
  }

  process.once("SIGINT", () => void shutdown());
  process.once("SIGTERM", () => void shutdown());
  process.once("exit", () => {
    if (registration?.filePath) rmSync(registration.filePath, { force: true });
  });

  console.log("\n局域网书架已启动");
  console.log(`本机访问：http://localhost:${result.port}`);
  for (const url of result.urls) console.log(`局域网访问：${url}`);
  console.log("按 Ctrl+C 停止当前服务。");
  console.log("运行 lan-reader stop 可一键停止全部书架。\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
