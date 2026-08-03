import { promises as fs } from "node:fs";
import path from "node:path";
import { LibraryError } from "./library.mjs";

export const CONFIG_FILE_NAME = ".lan-reader.json";
const MAX_CONFIG_BYTES = 256 * 1024;
const MIN_TEXT_BYTES = 1024;
const MAX_TEXT_BYTES = 32 * 1024 * 1024;
const RESERVED_EXTENSIONS = new Set([
  ".md",
  ".markdown",
  ".mdown",
  ".pdf",
  ".doc",
  ".docx",
  ".ppt",
  ".pptx",
  ".txt",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".avif",
  ".bmp",
  ".svg",
  ".ico",
]);
const KNOWN_TOP_LEVEL_KEYS = new Set(["version", "title", "textPreview", "features"]);
const KNOWN_TEXT_KEYS = new Set([
  "extensions",
  "maxBytes",
  "lineNumbers",
  "wrap",
  "syntaxHighlight",
]);
const KNOWN_FEATURE_KEYS = new Set([
  "copy",
  "download",
  "fullTextSearch",
  "autoRefresh",
  "readingPosition",
  "qrCode",
]);

export const DEFAULT_READER_CONFIG = Object.freeze({
  version: 1,
  title: null,
  textPreview: Object.freeze({
    extensions: Object.freeze([]),
    maxBytes: 8 * 1024 * 1024,
    lineNumbers: true,
    wrap: true,
    syntaxHighlight: true,
  }),
  features: Object.freeze({
    copy: true,
    download: true,
    fullTextSearch: true,
    autoRefresh: true,
    readingPosition: true,
    qrCode: true,
  }),
  warnings: Object.freeze([]),
});

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new LibraryError(`${CONFIG_FILE_NAME} 中的 ${label} 必须是对象`);
  }
}

function booleanValue(value, fallback, label) {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") {
    throw new LibraryError(`${CONFIG_FILE_NAME} 中的 ${label} 必须是 true 或 false`);
  }
  return value;
}

function unknownKeyWarnings(value, knownKeys, prefix) {
  return Object.keys(value)
    .filter((key) => !knownKeys.has(key))
    .map((key) => `忽略未知配置项：${prefix}${key}`);
}

function normalizeExtensions(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new LibraryError(`${CONFIG_FILE_NAME} 中的 textPreview.extensions 必须是数组`);
  }
  const extensions = new Set();
  for (const item of value) {
    if (typeof item !== "string") {
      throw new LibraryError("自定义文本扩展名必须是字符串");
    }
    const normalized = item.trim().toLocaleLowerCase();
    if (!/^\.[a-z0-9][a-z0-9+_-]{0,15}$/i.test(normalized)) {
      throw new LibraryError(`无效的文本扩展名：${item}`);
    }
    if (!RESERVED_EXTENSIONS.has(normalized)) extensions.add(normalized);
  }
  return [...extensions];
}

function normalizeConfig(raw) {
  assertPlainObject(raw, "根配置");
  if (raw.version !== 1) {
    throw new LibraryError(
      raw.version === undefined
        ? `${CONFIG_FILE_NAME} 缺少 version: 1`
        : `当前版本无法识别 version: ${String(raw.version)} 的配置`,
    );
  }

  const textPreview = raw.textPreview ?? {};
  const features = raw.features ?? {};
  assertPlainObject(textPreview, "textPreview");
  assertPlainObject(features, "features");

  if (raw.title !== undefined && (typeof raw.title !== "string" || !raw.title.trim())) {
    throw new LibraryError(`${CONFIG_FILE_NAME} 中的 title 必须是非空字符串`);
  }

  const maxBytes = textPreview.maxBytes ?? DEFAULT_READER_CONFIG.textPreview.maxBytes;
  if (
    !Number.isInteger(maxBytes)
    || maxBytes < MIN_TEXT_BYTES
    || maxBytes > MAX_TEXT_BYTES
  ) {
    throw new LibraryError(
      `${CONFIG_FILE_NAME} 中的 textPreview.maxBytes 必须是 ${MIN_TEXT_BYTES} 到 ${MAX_TEXT_BYTES} 之间的整数`,
    );
  }

  const warnings = [
    ...unknownKeyWarnings(raw, KNOWN_TOP_LEVEL_KEYS, ""),
    ...unknownKeyWarnings(textPreview, KNOWN_TEXT_KEYS, "textPreview."),
    ...unknownKeyWarnings(features, KNOWN_FEATURE_KEYS, "features."),
  ];

  return {
    version: 1,
    title: raw.title?.trim() || null,
    textPreview: {
      extensions: normalizeExtensions(textPreview.extensions),
      maxBytes,
      lineNumbers: booleanValue(
        textPreview.lineNumbers,
        DEFAULT_READER_CONFIG.textPreview.lineNumbers,
        "textPreview.lineNumbers",
      ),
      wrap: booleanValue(
        textPreview.wrap,
        DEFAULT_READER_CONFIG.textPreview.wrap,
        "textPreview.wrap",
      ),
      syntaxHighlight: booleanValue(
        textPreview.syntaxHighlight,
        DEFAULT_READER_CONFIG.textPreview.syntaxHighlight,
        "textPreview.syntaxHighlight",
      ),
    },
    features: Object.fromEntries(
      Object.entries(DEFAULT_READER_CONFIG.features).map(([key, fallback]) => [
        key,
        booleanValue(features[key], fallback, `features.${key}`),
      ]),
    ),
    warnings,
  };
}

export async function loadReaderConfig(root) {
  const configPath = path.join(root, CONFIG_FILE_NAME);
  let stats;
  try {
    stats = await fs.stat(configPath);
  } catch (error) {
    if (error.code === "ENOENT") {
      return {
        ...DEFAULT_READER_CONFIG,
        textPreview: {
          ...DEFAULT_READER_CONFIG.textPreview,
          extensions: [...DEFAULT_READER_CONFIG.textPreview.extensions],
        },
        features: { ...DEFAULT_READER_CONFIG.features },
        warnings: [],
      };
    }
    throw new LibraryError(`无法读取 ${CONFIG_FILE_NAME}`);
  }
  if (!stats.isFile()) throw new LibraryError(`${CONFIG_FILE_NAME} 必须是文件`);
  if (stats.size > MAX_CONFIG_BYTES) {
    throw new LibraryError(`${CONFIG_FILE_NAME} 过大，最多允许 ${MAX_CONFIG_BYTES} 字节`, 413);
  }

  let parsed;
  try {
    parsed = JSON.parse(await fs.readFile(configPath, "utf8"));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new LibraryError(`${CONFIG_FILE_NAME} JSON 格式错误：${error.message}`);
    }
    throw error;
  }
  return normalizeConfig(parsed);
}

export function publicReaderConfig(config) {
  return {
    version: config.version,
    title: config.title,
    textPreview: { ...config.textPreview, extensions: [...config.textPreview.extensions] },
    features: { ...config.features },
    warnings: [...config.warnings],
  };
}
