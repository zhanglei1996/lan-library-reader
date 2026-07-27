#!/usr/bin/env node
import { createReadStream, realpathSync, rmSync } from "node:fs";
import { promises as fs } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createAccessController, createReadableAccessCode } from "./auth.mjs";
import { HELP_TEXT, parseArguments } from "./cli.mjs";
import { publicReaderConfig } from "./config.mjs";
import { createLibreOfficeConverter } from "./converters/libreoffice.mjs";
import {
  createControlToken,
  isValidControlToken,
  listInstances,
  registerInstance,
  stopAllInstances,
  stopInstances,
  unregisterInstance,
} from "./instances.mjs";
import {
  LibraryError,
  createLibrary,
  getLibraryFile,
  kindForFile,
  readMarkdown,
  readText,
} from "./library.mjs";
import { createLibraryScanner } from "./scanner.mjs";
import { searchLibrary } from "./search.mjs";

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
const SAFE_ASSET_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".avif",
  ".bmp",
  ".svg",
  ".ico",
  ".woff2",
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

function streamFile(
  request,
  response,
  file,
  {
    name,
    contentType,
    cache = "no-store",
    disposition = "inline",
  },
) {
  function pipe(options) {
    const stream = createReadStream(file.absolutePath, options);
    stream.once("error", () => response.destroy());
    stream.pipe(response);
  }

  const total = file.stats.size;
  const range = request.headers.range;
  response.setHeader("Accept-Ranges", "bytes");
  response.setHeader("Cache-Control", cache);
  response.setHeader("Content-Type", contentType);
  if (name) response.setHeader("Content-Disposition", contentDisposition(name, disposition));

  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match) {
      response.writeHead(416, { "Content-Range": `bytes */${total}` });
      response.end();
      return;
    }
    let start;
    let end;
    if (!match[1] && match[2]) {
      const suffixLength = Number(match[2]);
      start = Math.max(0, total - suffixLength);
      end = total - 1;
    } else {
      start = Number(match[1]);
      end = match[2] ? Number(match[2]) : total - 1;
    }
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
    else pipe({ start, end });
    return;
  }

  response.writeHead(200, { "Content-Length": total });
  if (request.method === "HEAD") response.end();
  else pipe();
}

async function readJsonBody(request, maxBytes = 4 * 1024) {
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    total += chunk.length;
    if (total > maxBytes) throw new LibraryError("请求内容过大", 413);
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw new LibraryError("请求内容必须是有效 JSON");
  }
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
  scanOptions,
  accessCode = process.env.LAN_READER_ACCESS_CODE,
  controlToken,
  onStop,
} = {}) {
  const library = await createLibrary(root);
  const officeConverter = converter ?? await createLibreOfficeConverter();
  const scanner = createLibraryScanner(library, scanOptions);
  const access = createAccessController(accessCode);
  const eventResponses = new Set();

  function libraryInfo(snapshot) {
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    return {
      name: snapshot.config.title || library.name,
      documentCount: snapshot.documentCount,
      scan: snapshot.scan,
      revision: snapshot.revision,
      accessUrls: port ? localAddresses(port) : [],
      config: publicReaderConfig(snapshot.config),
      capabilities: {
        officePreview: officeConverter.available,
        officeProvider: officeConverter.available ? officeConverter.id : null,
        autoRefresh: scanner.watching,
        authentication: access.enabled,
      },
    };
  }

  const server = http.createServer(async (request, response) => {
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

      if (url.pathname === "/api/auth/status") {
        sendJson(response, 200, {
          required: access.enabled,
          authenticated: access.isAuthenticated(request),
        });
        return;
      }

      if (url.pathname === "/api/auth/login") {
        if (request.method !== "POST") {
          response.setHeader("Allow", "POST");
          sendJson(response, 405, { error: "登录接口只接受 POST 请求" });
          return;
        }
        const payload = await readJsonBody(request);
        const result = access.login(request, payload.code);
        if (result.rateLimited) {
          response.setHeader("Retry-After", String(result.retryAfterSeconds));
          sendJson(response, 429, { error: "尝试次数过多，请稍后再试" });
          return;
        }
        if (!result.ok) {
          sendJson(response, 401, { error: "访问码错误" });
          return;
        }
        if (result.cookie) response.setHeader("Set-Cookie", result.cookie);
        sendJson(response, 200, { authenticated: true });
        return;
      }

      if (url.pathname === "/api/auth/logout") {
        if (request.method !== "POST") {
          response.setHeader("Allow", "POST");
          sendJson(response, 405, { error: "退出接口只接受 POST 请求" });
          return;
        }
        response.setHeader("Set-Cookie", access.logout(request));
        sendJson(response, 200, { authenticated: false });
        return;
      }

      if (
        isApi
        && url.pathname !== "/api/health"
        && !access.isAuthenticated(request)
      ) {
        sendJson(response, 401, { error: "需要输入访问码", code: "AUTH_REQUIRED" });
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

      if (url.pathname === "/api/events") {
        response.writeHead(200, {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-store",
          Connection: "keep-alive",
        });
        eventResponses.add(response);
        response.write(`event: ready\ndata: ${JSON.stringify({ revision: 0 })}\n\n`);
        const unsubscribe = scanner.subscribe((revision) => {
          response.write(`event: library-change\ndata: ${JSON.stringify({ revision })}\n\n`);
        });
        request.once("close", () => {
          eventResponses.delete(response);
          unsubscribe();
        });
        return;
      }

      if (url.pathname === "/api/snapshot") {
        const scanResult = await scanner.snapshot({
          refresh: url.searchParams.get("refresh") === "1",
        });
        sendJson(response, 200, {
          tree: scanResult.tree,
          info: libraryInfo(scanResult),
        });
        return;
      }

      if (url.pathname === "/api/library") {
        const scanResult = await scanner.snapshot();
        sendJson(response, 200, libraryInfo(scanResult));
        return;
      }

      if (url.pathname === "/api/tree") {
        const scanResult = await scanner.snapshot();
        sendJson(response, 200, scanResult.tree);
        return;
      }

      if (url.pathname === "/api/markdown") {
        const snapshot = await scanner.snapshot();
        const document = await readMarkdown(
          library,
          url.searchParams.get("path") ?? "",
          { maxBytes: snapshot.config.textPreview.maxBytes },
        );
        sendJson(response, 200, document);
        return;
      }

      if (url.pathname === "/api/text") {
        const snapshot = await scanner.snapshot();
        const document = await readText(
          library,
          url.searchParams.get("path") ?? "",
          {
            maxBytes: snapshot.config.textPreview.maxBytes,
            textExtensions: snapshot.config.textPreview.extensions,
          },
        );
        sendJson(response, 200, document);
        return;
      }

      if (url.pathname === "/api/search") {
        const snapshot = await scanner.snapshot();
        if (!snapshot.config.features.fullTextSearch) {
          throw new LibraryError("全文搜索已在书架配置中关闭", 403);
        }
        const result = await searchLibrary(
          library,
          snapshot,
          url.searchParams.get("q") ?? "",
        );
        sendJson(response, 200, result);
        return;
      }

      if (url.pathname === "/api/file") {
        const snapshot = await scanner.snapshot();
        const file = await getLibraryFile(library, url.searchParams.get("path") ?? "");
        const extension = path.extname(file.name).toLocaleLowerCase();
        const listedKind = kindForFile(file.name, {
          textExtensions: snapshot.config.textPreview.extensions,
        });
        if (!listedKind && !SAFE_ASSET_EXTENSIONS.has(extension)) {
          throw new LibraryError("该文件未配置为可访问文档", 415);
        }
        setSecurityHeaders(response, { file: true });
        streamFile(request, response, file, {
          name: file.name,
          contentType: MIME_TYPES.get(path.extname(file.name).toLocaleLowerCase())
            ?? "application/octet-stream",
          disposition: url.searchParams.get("download") === "1" ? "attachment" : "inline",
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
  server.closeReaderEvents = () => {
    for (const response of eventResponses) response.end();
    eventResponses.clear();
  };
  server.disposeReaderResources = () => scanner.close();
  server.once("close", server.disposeReaderResources);
  return server;
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

function listenOnPort(server, port, host) {
  return new Promise((resolve, reject) => {
    const handleError = (error) => {
      server.off("listening", handleListening);
      reject(error);
    };
    const handleListening = () => {
      server.off("error", handleError);
      resolve();
    };
    server.once("error", handleError);
    server.once("listening", handleListening);
    server.listen(port, host);
  });
}

export async function startReaderServer(options = {}) {
  const server = await createReaderServer(options);
  const host = options.host ?? "0.0.0.0";
  const requestedPort = options.port ?? 8080;
  const maxPortAttempts = Number.isInteger(options.maxPortAttempts)
    && options.maxPortAttempts > 0
    ? options.maxPortAttempts
    : 100;
  let candidatePort = requestedPort;

  for (let attempt = 0; attempt < maxPortAttempts; attempt += 1) {
    try {
      await listenOnPort(server, candidatePort, host);
      break;
    } catch (error) {
      const canTryNext = error.code === "EADDRINUSE"
        && requestedPort !== 0
        && candidatePort < 65535
        && attempt + 1 < maxPortAttempts;
      if (canTryNext) {
        candidatePort += 1;
        continue;
      }
      if (error.code === "EADDRINUSE" && requestedPort !== 0) {
        server.closeReaderEvents?.();
        server.disposeReaderResources?.();
        throw new Error(
          `端口 ${requestedPort} 到 ${candidatePort} 均被占用，请指定其他端口`,
          { cause: error },
        );
      }
      server.closeReaderEvents?.();
      server.disposeReaderResources?.();
      throw error;
    }
  }

  const address = server.address();
  const port = typeof address === "object" && address ? address.port : requestedPort;
  return {
    server,
    host,
    port,
    requestedPort,
    portAdjusted: requestedPort !== 0 && port !== requestedPort,
    urls: localAddresses(port),
  };
}

async function main() {
  const rawArguments = process.argv.slice(2);
  if (rawArguments[0] === "list") {
    const instances = await listInstances();
    if (instances.length === 0) {
      console.log("当前没有运行中的局域网书架。");
      return;
    }
    console.log("运行中的局域网书架：");
    for (const instance of instances) {
      console.log(
        `- ${instance.root}  http://localhost:${instance.port}  ${instance.startedAt ?? ""}`,
      );
    }
    return;
  }
  if (rawArguments[0] === "stop") {
    if (rawArguments.length > 2) {
      console.error("stop 命令最多接受一个端口或文件夹");
      process.exitCode = 1;
      return;
    }
    const target = rawArguments[1];
    const summary = target
      ? await stopInstances({ target })
      : await stopAllInstances();
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
  const generatedAccessCode = options.protect ? createReadableAccessCode() : null;
  const accessCode = generatedAccessCode ?? process.env.LAN_READER_ACCESS_CODE;
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
    result.server.closeReaderEvents?.();
    await new Promise((resolve) => result.server.close(resolve));
    process.exit(0);
  };

  result = await startReaderServer({
    ...options,
    accessCode,
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
  if (accessCode) {
    console.log(
      `访问保护：已启用${generatedAccessCode ? `，临时访问码 ${generatedAccessCode}` : ""}`,
    );
  }
  if (result.portAdjusted) {
    console.log(`端口 ${result.requestedPort} 已被占用，已自动使用 ${result.port}。`);
  }
  console.log(`本机访问：http://localhost:${result.port}`);
  for (const url of result.urls) console.log(`局域网访问：${url}`);
  console.log("按 Ctrl+C 停止当前服务。");
  console.log("运行 lan-reader stop 可一键停止全部书架。\n");
}

export function isDirectExecution(argvEntry = process.argv[1]) {
  if (!argvEntry) return false;
  try {
    return realpathSync(argvEntry) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return import.meta.url === pathToFileURL(argvEntry).href;
  }
}

if (isDirectExecution()) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
