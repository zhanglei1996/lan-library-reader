import { LibraryError, readMarkdown, readText } from "./library.mjs";

const indexCache = new WeakMap();

function flattenFiles(nodes) {
  const files = [];
  for (const node of nodes) {
    if (node.type === "file") files.push(node);
    else files.push(...flattenFiles(node.children));
  }
  return files;
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
  const candidates = flattenFiles(snapshot.tree)
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
  const results = [];
  for (const { file, content } of documents) {
    const snippet = snippetFor(content, normalizedQuery);
    const nameMatch = file.name.toLocaleLowerCase().includes(normalizedQuery);
    if (!snippet && !nameMatch) continue;
    results.push({
      path: file.path,
      name: file.name,
      kind: file.kind,
      language: file.language,
      snippet: snippet ?? "文件名匹配",
    });
    if (results.length >= maxResults) break;
  }

  return {
    query,
    results,
    indexedFiles: documents.length,
    truncated: candidates.length > maxFiles || results.length >= maxResults,
  };
}
