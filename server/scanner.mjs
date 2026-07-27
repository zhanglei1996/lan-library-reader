import { watch } from "node:fs";
import path from "node:path";
import {
  buildLibraryTree,
  DEFAULT_IGNORED_DIRECTORY_NAMES,
  isIgnoredLibraryPath,
  loadLibraryIgnoreRules,
} from "./library.mjs";
import { loadReaderConfig } from "./config.mjs";

export function createLibraryScanner(library, scanOptions = {}) {
  let activeScan;
  let cachedSnapshot;
  let dirty = true;
  let watcher;
  let changeTimer;
  let revision = 0;
  const subscribers = new Set();
  const directoryCache = new Map();
  const dirtyDirectories = new Set([""]);
  const defaultIgnored = new Set(DEFAULT_IGNORED_DIRECTORY_NAMES);
  let ignoreRules = [];

  function notifyChanged(_eventType, rawFileName) {
    const fileName = rawFileName ? String(rawFileName) : "";
    const normalized = fileName.split(path.sep).join("/");
    const parts = normalized.split("/").filter(Boolean);
    if (
      (
        parts.some((part) => part.startsWith(".") || defaultIgnored.has(part))
        || isIgnoredLibraryPath(normalized, ignoreRules)
      )
      && ![".lan-reader.json", ".lan-readerignore"].includes(parts.at(-1))
    ) {
      return;
    }
    if (parts.at(-1) === ".lan-reader.json" || parts.at(-1) === ".lan-readerignore") {
      directoryCache.clear();
      dirtyDirectories.clear();
      dirtyDirectories.add("");
    } else {
      dirtyDirectories.add("");
      const directoryParts = parts.slice(0, -1);
      for (let index = 1; index <= directoryParts.length; index += 1) {
        dirtyDirectories.add(directoryParts.slice(0, index).join("/"));
      }
    }
    dirty = true;
    revision += 1;
    clearTimeout(changeTimer);
    changeTimer = setTimeout(() => {
      for (const subscriber of subscribers) subscriber(revision);
    }, 180);
    changeTimer.unref?.();
  }

  try {
    watcher = watch(library.root, { recursive: true }, notifyChanged);
    watcher.on("error", () => {
      dirty = true;
    });
  } catch {
    try {
      watcher = watch(library.root, notifyChanged);
    } catch {
      watcher = undefined;
    }
  }

  async function snapshot({ refresh = false } = {}) {
    if (!refresh && !dirty && cachedSnapshot) return cachedSnapshot;
    if (activeScan) return activeScan;
    const startedRevision = revision;
    const startedDirtyDirectories = new Set(
      refresh ? [""] : dirtyDirectories,
    );
    if (refresh) {
      directoryCache.clear();
      dirtyDirectories.clear();
      dirtyDirectories.add("");
    }
    const pending = (async () => {
      const config = await loadReaderConfig(library.root);
      ignoreRules = await loadLibraryIgnoreRules(library);
      const result = await buildLibraryTree(library, {
        ...scanOptions,
        textExtensions: config.textPreview.extensions,
        directoryCache,
        dirtyDirectories: startedDirtyDirectories,
        ignoreRules,
      });
      cachedSnapshot = { ...result, config, revision };
      for (const item of startedDirtyDirectories) dirtyDirectories.delete(item);
      dirty = revision !== startedRevision;
      return cachedSnapshot;
    })();
    activeScan = pending;
    pending.then(
      () => {
        if (activeScan === pending) activeScan = undefined;
      },
      () => {
        if (activeScan === pending) activeScan = undefined;
      },
    );
    return pending;
  }

  function subscribe(callback) {
    subscribers.add(callback);
    return () => subscribers.delete(callback);
  }

  function close() {
    clearTimeout(changeTimer);
    watcher?.close();
    subscribers.clear();
  }

  return {
    snapshot,
    invalidate: notifyChanged,
    subscribe,
    close,
    get watching() {
      return Boolean(watcher);
    },
  };
}
