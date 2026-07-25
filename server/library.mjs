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
]);

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

export function kindForFile(fileName) {
  return KIND_BY_EXTENSION.get(path.extname(fileName).toLocaleLowerCase()) ?? null;
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

export async function buildLibraryTree(library, { maxEntries = 20_000 } = {}) {
  let entryCount = 0;
  let documentCount = 0;

  async function visit(directory, relativeDirectory = "") {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    const nodes = [];

    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      if (entry.isSymbolicLink()) continue;
      entryCount += 1;
      if (entryCount > maxEntries) {
        throw new LibraryError(`书架文件过多，最多读取 ${maxEntries} 项`, 413);
      }

      const absolutePath = path.join(directory, entry.name);
      const relativePath = relativeDirectory
        ? path.join(relativeDirectory, entry.name)
        : entry.name;
      const webPath = toPosix(relativePath);

      if (entry.isDirectory()) {
        const children = await visit(absolutePath, relativePath);
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
      const kind = kindForFile(entry.name);
      if (!kind) continue;
      documentCount += 1;
      nodes.push({
        type: "file",
        name: entry.name,
        path: webPath,
        kind,
      });
    }

    return sortNodes(nodes);
  }

  const tree = await visit(library.root);
  return { tree, documentCount };
}

export async function readMarkdown(library, requestedPath, { maxBytes = 8 * 1024 * 1024 } = {}) {
  const absolutePath = await resolveLibraryPath(library, requestedPath);
  if (kindForFile(absolutePath) !== "markdown") {
    throw new LibraryError("该文件不是 Markdown 文档", 415);
  }
  const stats = await fs.stat(absolutePath);
  if (!stats.isFile()) throw new LibraryError("请求的路径不是文件");
  if (stats.size > maxBytes) {
    throw new LibraryError("Markdown 文档过大", 413);
  }
  return {
    name: path.basename(absolutePath),
    path: toPosix(path.relative(library.root, absolutePath)),
    content: await fs.readFile(absolutePath, "utf8"),
    modifiedAt: stats.mtime.toISOString(),
  };
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
