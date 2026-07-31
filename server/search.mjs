import { LibraryError, readMarkdown, readText } from "./library.mjs";

const indexCache = new WeakMap();

function flattenNodes(nodes) {
  const flattened = [];
  for (const node of nodes) {
    flattened.push(node);
    if (node.type === "directory") {
      flattened.push(...flattenNodes(node.children));
    }
  }
  return flattened;
}

function snippetFor(content, normalizedQuery) {
  const normalized = content.toLocaleLowerCase();
  const index = normalized.indexOf(normalizedQuery);
  if (index < 0) return null;
  const start = Math.max(0, index - 70);
  const end = Math.min(content.length, index + normalizedQuery.length + 130);
  return `${start > 0 ? "…" : ""}${content.slice(start, end).replace(/\s+/g, " ")}${end < content.length ? "…" : ""}`;
}

export async function searchLibrary(
  library,
  snapshot,
  rawQuery,
  { maxFiles = 2_000, maxResults = 50 } = {},
) {
  const query = String(rawQuery ?? "").trim();
  if (!query) return { query, results: [], indexedFiles: 0, truncated: false };
  if (query.length > 200) throw new LibraryError("搜索内容过长");
  const normalizedQuery = query.toLocaleLowerCase();
  const nodes = flattenNodes(snapshot.tree);
  const files = nodes.filter((node) => node.type === "file");
  const candidates = files
    .filter((file) => file.kind === "markdown" || file.kind === "text");
  let indexPromise = indexCache.get(snapshot);
  if (!indexPromise) {
    indexPromise = (async () => {
      const documents = [];
      for (const file of candidates.slice(0, maxFiles)) {
        try {
          const document = file.kind === "markdown"
            ? await readMarkdown(library, file.path, {
              maxBytes: snapshot.config.textPreview.maxBytes,
            })
            : await readText(library, file.path, {
              maxBytes: snapshot.config.textPreview.maxBytes,
              textExtensions: snapshot.config.textPreview.extensions,
            });
          documents.push({ file, content: document.content });
        } catch {
          // A changing or unreadable file should not abort the remaining index.
        }
      }
      return documents;
    })();
    indexCache.set(snapshot, indexPromise);
  }
  const documents = await indexPromise;
  const matches = new Map();
  for (const node of nodes) {
    if (!node.name.toLocaleLowerCase().includes(normalizedQuery)) continue;
    if (node.type === "directory") {
      matches.set(node.path, {
        type: "directory",
        path: node.path,
        name: node.name,
        snippet: `目录：${node.path}`,
      });
      continue;
    }
    matches.set(node.path, {
      type: "file",
      path: node.path,
      name: node.name,
      kind: node.kind,
      language: node.language,
      snippet: "文件名匹配",
    });
  }

  for (const { file, content } of documents) {
    const snippet = snippetFor(content, normalizedQuery);
    if (!snippet) continue;
    const existing = matches.get(file.path);
    if (existing) {
      existing.snippet = snippet;
      continue;
    }
    matches.set(file.path, {
      type: "file",
      path: file.path,
      name: file.name,
      kind: file.kind,
      language: file.language,
      snippet,
    });
  }
  const allResults = [...matches.values()];

  return {
    query,
    results: allResults.slice(0, maxResults),
    indexedFiles: documents.length,
    truncated: candidates.length > maxFiles || allResults.length > maxResults,
  };
}
