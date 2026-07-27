import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import hljs from "highlight.js/lib/core";
import { ListOrdered, WrapText } from "lucide-react";
import type { TextDocument } from "../types";

const LANGUAGE_ALIASES: Record<string, string> = {
  shell: "bash",
  html: "xml",
};
const LANGUAGE_LOADERS = {
  bash: () => import("highlight.js/lib/languages/bash"),
  css: () => import("highlight.js/lib/languages/css"),
  go: () => import("highlight.js/lib/languages/go"),
  java: () => import("highlight.js/lib/languages/java"),
  javascript: () => import("highlight.js/lib/languages/javascript"),
  json: () => import("highlight.js/lib/languages/json"),
  python: () => import("highlight.js/lib/languages/python"),
  rust: () => import("highlight.js/lib/languages/rust"),
  sql: () => import("highlight.js/lib/languages/sql"),
  typescript: () => import("highlight.js/lib/languages/typescript"),
  xml: () => import("highlight.js/lib/languages/xml"),
  yaml: () => import("highlight.js/lib/languages/yaml"),
};

async function ensureLanguage(language: string) {
  const canonical = LANGUAGE_ALIASES[language] ?? language;
  if (hljs.getLanguage(language)) return true;
  const loader = LANGUAGE_LOADERS[canonical as keyof typeof LANGUAGE_LOADERS];
  if (!loader) return false;
  const module = await loader();
  if (!hljs.getLanguage(canonical)) hljs.registerLanguage(canonical, module.default);
  if (language !== canonical && !hljs.getLanguage(language)) {
    hljs.registerLanguage(language, module.default);
  }
  return true;
}

function highlightedNodes(content: string, language: string): ReactNode {
  if (!hljs.getLanguage(language)) return content;
  const html = hljs.highlight(content, { language, ignoreIllegals: true }).value;
  const parsed = new DOMParser().parseFromString(`<code>${html}</code>`, "text/html");

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

export default function TextReader({
  document,
  fontScale,
  initialLineNumbers,
  initialWrap,
  syntaxHighlight,
}: {
  document: TextDocument;
  fontScale: number;
  initialLineNumbers: boolean;
  initialWrap: boolean;
  syntaxHighlight: boolean;
}) {
  const [lineNumbers, setLineNumbers] = useState(initialLineNumbers);
  const [wrap, setWrap] = useState(initialWrap);
  const [highlightReady, setHighlightReady] = useState(false);
  const lineCount = useMemo(
    () => document.content.split("\n").length,
    [document.content],
  );
  const canShowLineNumbers = lineCount <= 50_000;
  const canHighlight = syntaxHighlight && document.size <= 512 * 1024;
  useEffect(() => {
    let active = true;
    setHighlightReady(false);
    if (!canHighlight) return () => {
      active = false;
    };
    void ensureLanguage(document.language)
      .then((available) => {
        if (active) setHighlightReady(available);
      })
      .catch(() => {
        if (active) setHighlightReady(false);
      });
    return () => {
      active = false;
    };
  }, [canHighlight, document.language]);
  const content = useMemo(
    () => canHighlight && highlightReady
      ? highlightedNodes(document.content, document.language)
      : document.content,
    [canHighlight, document.content, document.language, highlightReady],
  );

  return (
    <section
      className={`text-reader ${wrap ? "is-wrapped" : ""}`}
      style={{ "--reader-scale": fontScale } as React.CSSProperties}
    >
      <div className="text-reader-meta">
        <span>{document.encoding.toUpperCase()}</span>
        <span>{document.size.toLocaleString()} 字节</span>
        <button
          className={wrap ? "is-active" : ""}
          onClick={() => setWrap((value) => !value)}
          title="切换自动换行"
        >
          <WrapText /> 自动换行
        </button>
        <button
          className={lineNumbers ? "is-active" : ""}
          onClick={() => setLineNumbers((value) => !value)}
          title="切换行号"
          disabled={!canShowLineNumbers}
        >
          <ListOrdered /> 行号
        </button>
        {!canHighlight && syntaxHighlight && <span>大文件已关闭高亮</span>}
      </div>
      <div className="text-code">
        {lineNumbers && canShowLineNumbers && (
          <pre className="line-numbers" aria-hidden="true">
            {Array.from({ length: lineCount }, (_, index) => index + 1).join("\n")}
          </pre>
        )}
        <pre className="source-code"><code>{content}</code></pre>
      </div>
    </section>
  );
}
