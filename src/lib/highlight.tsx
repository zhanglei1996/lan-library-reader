import type { ReactNode } from "react";
import hljs from "highlight.js/lib/core";

const LANGUAGE_ALIASES: Record<string, string> = {
  html: "xml",
  js: "javascript",
  jsx: "javascript",
  md: "markdown",
  sh: "bash",
  shell: "bash",
  ts: "typescript",
  tsx: "typescript",
  vue: "xml",
};

const LANGUAGE_LOADERS = {
  bash: () => import("highlight.js/lib/languages/bash"),
  css: () => import("highlight.js/lib/languages/css"),
  go: () => import("highlight.js/lib/languages/go"),
  java: () => import("highlight.js/lib/languages/java"),
  javascript: () => import("highlight.js/lib/languages/javascript"),
  json: () => import("highlight.js/lib/languages/json"),
  markdown: () => import("highlight.js/lib/languages/markdown"),
  python: () => import("highlight.js/lib/languages/python"),
  rust: () => import("highlight.js/lib/languages/rust"),
  sql: () => import("highlight.js/lib/languages/sql"),
  typescript: () => import("highlight.js/lib/languages/typescript"),
  xml: () => import("highlight.js/lib/languages/xml"),
  yaml: () => import("highlight.js/lib/languages/yaml"),
};

export async function ensureHighlightLanguage(language: string) {
  const normalized = language.toLowerCase();
  const canonical = LANGUAGE_ALIASES[normalized] ?? normalized;
  if (hljs.getLanguage(normalized)) return true;
  const loader = LANGUAGE_LOADERS[canonical as keyof typeof LANGUAGE_LOADERS];
  if (!loader) return false;
  const module = await loader();
  if (!hljs.getLanguage(canonical)) {
    hljs.registerLanguage(canonical, module.default);
  }
  if (normalized !== canonical && !hljs.getLanguage(normalized)) {
    hljs.registerLanguage(normalized, module.default);
  }
  return true;
}

export function highlightedCode(content: string, language: string): ReactNode {
  const normalized = language.toLowerCase();
  if (!hljs.getLanguage(normalized)) return content;
  const html = hljs.highlight(content, {
    language: normalized,
    ignoreIllegals: true,
  }).value;
  const parsed = new DOMParser().parseFromString(
    `<code>${html}</code>`,
    "text/html",
  );

  function convert(node: Node, key: string): ReactNode {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent;
    if (!(node instanceof HTMLElement)) return null;
    const children = [...node.childNodes].map((child, index) =>
      convert(child, `${key}-${index}`),
    );
    if (node.tagName === "SPAN") {
      const safeClass = [...node.classList]
        .filter((name) => /^hljs-[a-z-]+$/.test(name))
        .join(" ");
      return <span className={safeClass} key={key}>{children}</span>;
    }
    return <span key={key}>{children}</span>;
  }

  return [...(parsed.body.firstElementChild?.childNodes ?? [])]
    .map((node, index) => convert(node, String(index)));
}
