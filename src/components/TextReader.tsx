import { useEffect, useMemo, useState } from "react";
import { ListOrdered, WrapText } from "lucide-react";
import {
  ensureHighlightLanguage,
  highlightedCode,
} from "../lib/highlight";
import type { TextDocument } from "../types";

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
    void ensureHighlightLanguage(document.language)
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
      ? highlightedCode(document.content, document.language)
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
