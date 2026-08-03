import path from "node:path";
import { promises as fs } from "node:fs";

const KIND_BY_EXTENSION = new Map([
  [".md", "markdown"],
  [".markdown", "markdown"],
  [".mdown", "markdown"],
  [".pdf", "pdf"],
  [".doc", "word"],
  [".docx", "word"],
  [".ppt", "powerpoint"],
  [".pptx", "powerpoint"],
  [".txt", "text"],
  [".png", "image"],
  [".jpg", "image"],
  [".jpeg", "image"],
  [".gif", "image"],
  [".webp", "image"],
  [".avif", "image"],
  [".bmp", "image"],
  [".svg", "image"],
  [".ico", "image"],
]);

const LANGUAGE_BY_EXTENSION = new Map([
  [".txt", "text"],
  [".log", "log"],
  [".json", "json"],
  [".jsonc", "json"],
  [".yaml", "yaml"],
  [".yml", "yaml"],
  [".js", "javascript"],
  [".mjs", "javascript"],
  [".cjs", "javascript"],
  [".jsx", "javascript"],
  [".ts", "typescript"],
  [".tsx", "typescript"],
  [".java", "java"],
  [".kt", "kotlin"],
  [".py", "python"],
  [".go", "go"],
  [".rs", "rust"],
  [".sh", "shell"],
  [".bash", "shell"],
  [".zsh", "shell"],
  [".sql", "sql"],
  [".css", "css"],
  [".scss", "scss"],
  [".html", "html"],
  [".xml", "xml"],
  [".vue", "vue"],
  [".svelte", "svelte"],
  [".properties", "properties"],
  [".ini", "ini"],
  [".toml", "toml"],
]);

export const DEFAULT_IGNORED_DIRECTORY_NAMES = Object.freeze([
  "node_modules",
  "target",
  "dist",
  "build",
  "out",
  "coverage",
  "vendor",
  "bower_components",
  "__pycache__",
]);

const IGNORE_FILE_NAME = ".lan-readerignore";
const RECOVERABLE_DIRECTORY_ERRORS = new Set(["EACCES", "EPERM", "ENOENT", "ENOTDIR"]);

const collator = new Intl.Collator("zh-CN", {
  numeric: true,
  sensitivity: "base",
});

export class LibraryError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = "LibraryError";
    this.statusCode = statusCode;
  }
}

function toPosix(relativePath) {
  return relativePath.split(path.sep).join("/");
}

function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

export async function createLibrary(rootDirectory) {
  const absoluteRoot = path.resolve(rootDirectory);
  let root;
  try {
    root = await fs.realpath(absoluteRoot);
  } catch {
    throw new LibraryError("启动目录不存在", 404);
  }
  const stats = await fs.stat(root);
  if (!stats.isDirectory()) throw new LibraryError("启动路径必须是文件夹");

  return {
    root,
    name: path.basename(root) || root,
  };
}

export function kindForFile(fileName, { textExtensions = [] } = {}) {
  const extension = path.extname(fileName).toLocaleLowerCase();
  return KIND_BY_EXTENSION.get(extension)
    ?? (textExtensions.includes(extension) ? "text" : null);
}

export function languageForFile(fileName) {
  const extension = path.extname(fileName).toLocaleLowerCase();
  return LANGUAGE_BY_EXTENSION.get(extension) ?? (extension.slice(1) || "text");
}

export async function resolveLibraryPath(library, requestedPath) {
  if (typeof requestedPath !== "string" || requestedPath.includes("\0")) {
    throw new LibraryError("无效的文件路径");
  }
  if (path.isAbsolute(requestedPath)) {
    throw new LibraryError("不能访问书架之外的文件", 403);
  }
  const pathParts = requestedPath.split(/[\\/]+/);
  if (pathParts.some((part) => part.startsWith(".") && part !== "." && part !== "..")) {
    throw new LibraryError("不能访问隐藏文件", 403);
  }

  const lexicalPath = path.resolve(library.root, requestedPath || ".");
  if (!isInside(library.root, lexicalPath)) {
    throw new LibraryError("不能访问书架之外的文件", 403);
  }

  let realPath;
  try {
    realPath = await fs.realpath(lexicalPath);
  } catch {
    throw new LibraryError("文件不存在", 404);
  }
  if (!isInside(library.root, realPath)) {
    throw new LibraryError("不能访问书架之外的文件", 403);
  }
  return realPath;
}

function sortNodes(nodes) {
  return nodes.sort((left, right) => {
    if (left.type !== right.type) return left.type === "directory" ? -1 : 1;
    return collator.compare(left.name, right.name);
  });
}

function normalizeIgnoreRule(rule) {
  const normalized = rule
    .trim()
    .replaceAll("\\", "/")
    .replace(/^\.?\//, "")
    .replace(/\/+$/, "");
  if (
    !normalized
    || normalized.startsWith("#")
    || normalized.split("/").some((part) => part === "..")
  ) {
    return null;
  }
  return normalized;
}

export async function loadLibraryIgnoreRules(library) {
  try {
    const contents = await fs.readFile(path.join(library.root, IGNORE_FILE_NAME), "utf8");
    return contents
      .split(/\r?\n/)
      .map(normalizeIgnoreRule)
      .filter(Boolean);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw new LibraryError(`无法读取 ${IGNORE_FILE_NAME}`, 500);
  }
}

function matchesIgnoreRule(entryName, webPath, ignoreRules) {
  return ignoreRules.some((rule) =>
    rule.includes("/") ? webPath === rule : entryName === rule
  );
}

export function isIgnoredLibraryPath(
  relativePath,
  ignoreRules,
  ignoredDirectoryNames = DEFAULT_IGNORED_DIRECTORY_NAMES,
) {
  const normalized = toPosix(relativePath).replace(/^\/+|\/+$/g, "");
  const parts = normalized.split("/").filter(Boolean);
  if (
    parts.some((part) =>
      part.startsWith(".") || ignoredDirectoryNames.includes(part)
    )
  ) {
    return true;
  }
  return ignoreRules.some((rule) =>
    rule.includes("/")
      ? normalized === rule || normalized.startsWith(`${rule}/`)
      : parts.includes(rule)
  );
}

export async function buildLibraryTree(
  library,
  {
    maxEntries = 20_000,
    maxVisitedEntries = 250_000,
    maxDepth = 100,
    ignoredDirectoryNames = DEFAULT_IGNORED_DIRECTORY_NAMES,
    textExtensions = [],
    directoryCache,
    dirtyDirectories,
    ignoreRules: providedIgnoreRules,
  } = {},
) {
  let entryCount = 0;
  let visitedEntryCount = 0;
  let documentCount = 0;
  let ignoredEntryCount = 0;
  let unreadableDirectoryCount = 0;
  let depthLimitedDirectoryCount = 0;
  const unreadableDirectories = [];
  const ignoredDirectorySet = new Set(ignoredDirectoryNames);
  const ignoreRules = providedIgnoreRules ?? await loadLibraryIgnoreRules(library);

  async function visit(directory, relativeDirectory = "", depth = 0) {
    const cacheKey = toPosix(relativeDirectory);
    const cached = directoryCache?.get(cacheKey);
    if (cached && dirtyDirectories && !dirtyDirectories.has(cacheKey)) {
      entryCount += cached.scan.scannedEntries;
      if (entryCount > maxEntries) {
        throw new LibraryError(
          `书架文档超过 ${maxEntries} 篇。请在 ${IGNORE_FILE_NAME} 中排除无需阅读的目录，或从更小的目录启动`,
          413,
        );
      }
      visitedEntryCount += cached.scan.visitedEntries ?? cached.scan.scannedEntries;
      if (visitedEntryCount > maxVisitedEntries) {
        throw new LibraryError(
          `目录检查超过 ${maxVisitedEntries} 个文件和文件夹。请在 ${IGNORE_FILE_NAME} 中排除无需阅读的目录，或从更小的目录启动`,
          413,
        );
      }
      documentCount += cached.documentCount;
      ignoredEntryCount += cached.scan.ignoredEntries;
      unreadableDirectoryCount += cached.scan.unreadableDirectoryCount;
      depthLimitedDirectoryCount += cached.scan.depthLimitedDirectoryCount;
      for (const item of cached.scan.unreadableDirectories) {
        if (unreadableDirectories.length < 20) unreadableDirectories.push(item);
      }
      return cached.nodes;
    }

    const before = {
      entryCount,
      visitedEntryCount,
      documentCount,
      ignoredEntryCount,
      unreadableDirectoryCount,
      unreadableLength: unreadableDirectories.length,
      depthLimitedDirectoryCount,
    };
    let entries;
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (relativeDirectory && RECOVERABLE_DIRECTORY_ERRORS.has(error.code)) {
        unreadableDirectoryCount += 1;
        if (unreadableDirectories.length < 20) {
          unreadableDirectories.push(toPosix(relativeDirectory));
        }
        return [];
      }
      const label = relativeDirectory ? `目录“${toPosix(relativeDirectory)}”` : "启动目录";
      const statusCode = error.code === "EACCES" || error.code === "EPERM" ? 403 : 500;
      throw new LibraryError(`无法读取${label}`, statusCode);
    }
    const nodes = [];

    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name);
      const relativePath = relativeDirectory
        ? path.join(relativeDirectory, entry.name)
        : entry.name;
      const webPath = toPosix(relativePath);

      if (
        entry.name.startsWith(".")
        || entry.isSymbolicLink()
        || (entry.isDirectory() && ignoredDirectorySet.has(entry.name))
        || matchesIgnoreRule(entry.name, webPath, ignoreRules)
      ) {
        ignoredEntryCount += 1;
        continue;
      }

      visitedEntryCount += 1;
      if (visitedEntryCount > maxVisitedEntries) {
        throw new LibraryError(
          `目录检查超过 ${maxVisitedEntries} 个文件和文件夹。请在 ${IGNORE_FILE_NAME} 中排除无需阅读的目录，或从更小的目录启动`,
          413,
        );
      }

      if (entry.isDirectory()) {
        if (depth >= maxDepth) {
          depthLimitedDirectoryCount += 1;
          continue;
        }
        const children = await visit(absolutePath, relativePath, depth + 1);
        if (children.length > 0) {
          nodes.push({
            type: "directory",
            name: entry.name,
            path: webPath,
            children,
          });
        }
        continue;
      }

      if (!entry.isFile()) continue;
      const kind = kindForFile(entry.name, { textExtensions });
      if (!kind) continue;
      entryCount += 1;
      if (entryCount > maxEntries) {
        throw new LibraryError(
          `书架文档超过 ${maxEntries} 篇。请在 ${IGNORE_FILE_NAME} 中排除无需阅读的目录，或从更小的目录启动`,
          413,
        );
      }
      documentCount += 1;
      nodes.push({
        type: "file",
        name: entry.name,
        path: webPath,
        kind,
        ...(kind === "text" ? { language: languageForFile(entry.name) } : {}),
      });
    }

    const sortedNodes = sortNodes(nodes);
    directoryCache?.set(cacheKey, {
      nodes: sortedNodes,
      documentCount: documentCount - before.documentCount,
      scan: {
        scannedEntries: entryCount - before.entryCount,
        visitedEntries: visitedEntryCount - before.visitedEntryCount,
        ignoredEntries: ignoredEntryCount - before.ignoredEntryCount,
        unreadableDirectoryCount:
          unreadableDirectoryCount - before.unreadableDirectoryCount,
        unreadableDirectories: unreadableDirectories.slice(before.unreadableLength),
        depthLimitedDirectoryCount:
          depthLimitedDirectoryCount - before.depthLimitedDirectoryCount,
      },
    });
    return sortedNodes;
  }

  const tree = await visit(library.root);
  return {
    tree,
    documentCount,
    scan: {
      scannedEntries: entryCount,
      visitedEntries: visitedEntryCount,
      ignoredEntries: ignoredEntryCount,
      unreadableDirectoryCount,
      unreadableDirectories,
      depthLimitedDirectoryCount,
    },
  };
}

function looksBinary(buffer) {
  if (buffer.includes(0)) return true;
  const sampleLength = Math.min(buffer.length, 8_192);
  let suspicious = 0;
  for (let index = 0; index < sampleLength; index += 1) {
    const byte = buffer[index];
    if (byte < 7 || (byte > 13 && byte < 32)) suspicious += 1;
  }
  return sampleLength > 0 && suspicious / sampleLength > 0.1;
}

function decodeText(buffer) {
  const value = buffer.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))
    ? buffer.subarray(3)
    : buffer;
  try {
    return {
      content: new TextDecoder("utf-8", { fatal: true }).decode(value),
      encoding: "utf-8",
    };
  } catch {
    try {
      return {
        content: new TextDecoder("gb18030", { fatal: true }).decode(buffer),
        encoding: "gb18030",
      };
    } catch {
      throw new LibraryError("无法识别文本编码", 415);
    }
  }
}

async function readTextFile(
  library,
  requestedPath,
  {
    maxBytes = 8 * 1024 * 1024,
    expectedKinds = ["markdown", "text"],
    textExtensions = [],
  } = {},
) {
  const absolutePath = await resolveLibraryPath(library, requestedPath);
  const kind = kindForFile(absolutePath, { textExtensions });
  if (!kind || !expectedKinds.includes(kind)) {
    throw new LibraryError("该文件未配置为可预览文本", 415);
  }
  const stats = await fs.stat(absolutePath);
  if (!stats.isFile()) throw new LibraryError("请求的路径不是文件");
  if (stats.size > maxBytes) {
    throw new LibraryError(`文本文件过大，最多读取 ${maxBytes} 字节`, 413);
  }
  const buffer = await fs.readFile(absolutePath);
  if (looksBinary(buffer)) throw new LibraryError("该文件包含二进制内容，无法按文本预览", 415);
  const decoded = decodeText(buffer);
  return {
    name: path.basename(absolutePath),
    path: toPosix(path.relative(library.root, absolutePath)),
    kind,
    language: kind === "markdown" ? "markdown" : languageForFile(absolutePath),
    content: decoded.content,
    encoding: decoded.encoding,
    size: stats.size,
    modifiedAt: stats.mtime.toISOString(),
  };
}

export async function readMarkdown(library, requestedPath, { maxBytes = 8 * 1024 * 1024 } = {}) {
  const document = await readTextFile(library, requestedPath, {
    maxBytes,
    expectedKinds: ["markdown"],
  });
  return {
    name: document.name,
    path: document.path,
    content: document.content,
    modifiedAt: document.modifiedAt,
  };
}

export async function readText(library, requestedPath, options = {}) {
  return readTextFile(library, requestedPath, {
    ...options,
    expectedKinds: ["text"],
  });
}

export async function getLibraryFile(library, requestedPath) {
  const absolutePath = await resolveLibraryPath(library, requestedPath);
  const stats = await fs.stat(absolutePath);
  if (!stats.isFile()) throw new LibraryError("请求的路径不是文件");
  return {
    absolutePath,
    stats,
    name: path.basename(absolutePath),
    kind: kindForFile(absolutePath),
  };
}
