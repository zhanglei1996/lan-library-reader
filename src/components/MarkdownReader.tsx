import { isValidElement, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { Check, Copy, ExternalLink } from "lucide-react";
import "katex/dist/katex.min.css";
import { copyText } from "../lib/clipboard";
import {
  ensureHighlightLanguage,
  highlightedCode,
} from "../lib/highlight";
import { parseSafeHtmlAnchor } from "../lib/markdownHtml";
import { createMarkdownSegments } from "../lib/markdownSegments";
import { fileUrl, resolveRelativePath } from "../lib/path";
import type { Heading, MarkdownDocument } from "../types";
import MarkdownImage from "./MarkdownImage";
import MermaidDiagram from "./MermaidDiagram";

interface MarkdownReaderProps {
  document: MarkdownDocument;
  fontScale: number;
  onNavigate: (path: string) => boolean;
}

function isExternal(value: string): boolean {
  return /^(https?:|mailto:|tel:)/i.test(value);
}

function decodeMarkdownUrl(value: string): string {
  try {
    return decodeURI(value);
  } catch {
    return value;
  }
}

function nodeText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return nodeText(node.props.children);
  return "";
}

interface MarkdownAstNode {
  type?: string;
  value?: string;
  children?: MarkdownAstNode[];
  data?: {
    hName?: string;
    hProperties?: Record<string, unknown>;
  };
}

interface HtmlAstNode {
  type?: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HtmlAstNode[];
}

function remarkNormalizeRawHtml() {
  return (tree: MarkdownAstNode) => {
    function normalize(node: MarkdownAstNode) {
      if (!node.children) return;
      const normalizedChildren: MarkdownAstNode[] = [];
      for (let index = 0; index < node.children.length; index += 1) {
        const child = node.children[index];
        if (child.type === "html") {
          const value = child.value?.trim() ?? "";
          if (/^<!--[\s\S]*-->$/.test(value)) continue;
          const next = node.children[index + 1];
          const pairedValue = next?.type === "html"
            ? `${value}${next.value?.trim() ?? ""}`
            : value;
          const anchorId = parseSafeHtmlAnchor(pairedValue)
            ?? parseSafeHtmlAnchor(value);
          if (anchorId) {
            child.type = "text";
            child.value = "";
            child.data = {
              hName: "span",
              hProperties: {
                id: anchorId,
                className: ["markdown-anchor"],
                "aria-hidden": "true",
              },
            };
            if (pairedValue !== value) index += 1;
          } else {
            child.type = node.type === "root" ? "code" : "inlineCode";
            child.value = value;
          }
        }
        normalize(child);
        normalizedChildren.push(child);
      }
      node.children = normalizedChildren;
    }
    normalize(tree);
  };
}

const ALERT_LABELS: Record<string, string> = {
  note: "说明",
  tip: "提示",
  important: "重要",
  warning: "警告",
  caution: "注意",
};

function remarkAlerts() {
  return (tree: MarkdownAstNode) => {
    function transform(node: MarkdownAstNode) {
      if (node.type === "blockquote") {
        const paragraph = node.children?.[0];
        const text = paragraph?.children?.[0];
        const match = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\](?:\s*\n|\s*$)/i
          .exec(text?.value ?? "");
        if (match && text) {
          const kind = match[1].toLowerCase();
          text.value = (text.value ?? "").slice(match[0].length);
          node.data = {
            hName: "aside",
            hProperties: {
              className: ["markdown-alert", `markdown-alert-${kind}`],
              "data-alert-label": ALERT_LABELS[kind],
            },
          };
        }
      }
      for (const child of node.children ?? []) transform(child);
    }
    transform(tree);
  };
}

function rehypeStableHeadingIds(options: { headings: Heading[] }) {
  return (tree: HtmlAstNode) => {
    let index = 0;
    function transform(node: HtmlAstNode) {
      if (/^h[1-6]$/.test(node.tagName ?? "")) {
        const expected = options.headings[index];
        if (expected) {
          node.properties = { ...node.properties, id: expected.id };
          index += 1;
        }
      }
      for (const child of node.children ?? []) transform(child);
    }
    transform(tree);
  };
}

function HighlightedCode({
  source,
  language,
}: {
  source: string;
  language?: string;
}) {
  const [ready, setReady] = useState(false);
  const canHighlight = Boolean(language) && source.length <= 200_000;
  useEffect(() => {
    let active = true;
    setReady(false);
    if (!canHighlight || !language) return () => {
      active = false;
    };
    void ensureHighlightLanguage(language)
      .then((available) => {
        if (active) setReady(available);
      })
      .catch(() => {
        if (active) setReady(false);
      });
    return () => {
      active = false;
    };
  }, [canHighlight, language]);
  const content = useMemo(
    () => canHighlight && ready && language
      ? highlightedCode(source, language)
      : source,
    [canHighlight, language, ready, source],
  );
  return (
    <code className={language ? `language-${language}` : undefined}>
      {content}
    </code>
  );
}

function CopyableCodeBlock({
  source,
  language,
}: {
  source: string;
  language?: string;
}) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    if (!await copyText(source)) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  }
  return (
    <div className="code-block">
      <button onClick={() => void copy()} aria-label="复制代码">
        {copied ? <Check /> : <Copy />}
        {copied ? "已复制" : "复制"}
      </button>
      <pre><HighlightedCode source={source} language={language} /></pre>
    </div>
  );
}

function MarkdownPre({ children }: { children?: ReactNode }) {
  if (isValidElement<{ className?: string; children?: ReactNode }>(children)) {
    const source = nodeText(children.props.children).replace(/\n$/, "");
    const language = children.props.className
      ?.split(/\s+/)
      .find((name) => name.startsWith("language-"))
      ?.slice("language-".length);
    if (language === "mermaid") {
      return (
        <MermaidDiagram source={source} />
      );
    }
    return <CopyableCodeBlock source={source} language={language} />;
  }
  return <CopyableCodeBlock source={nodeText(children).replace(/\n$/, "")} />;
}

export default function MarkdownReader({
  document,
  fontScale,
  onNavigate,
}: MarkdownReaderProps) {
  const segments = useMemo(
    () => createMarkdownSegments(document.content),
    [document.content],
  );
  const [visibleSegments, setVisibleSegments] = useState(
    Math.min(2, segments.length),
  );
  const restoredHashRef = useRef("");
  useEffect(() => {
    if (visibleSegments >= segments.length) return;
    const renderMore = () => {
      setVisibleSegments((value) => Math.min(segments.length, value + 2));
    };
    const idleWindow = window as unknown as {
      requestIdleCallback?: (
        callback: IdleRequestCallback,
        options?: IdleRequestOptions,
      ) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (idleWindow.requestIdleCallback) {
      const id = idleWindow.requestIdleCallback(renderMore, { timeout: 350 });
      return () => idleWindow.cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(renderMore, 32);
    return () => window.clearTimeout(id);
  }, [segments.length, visibleSegments]);

  useEffect(() => {
    const encodedHash = window.location.hash.slice(1);
    if (!encodedHash) return;
    let hash = encodedHash;
    try {
      hash = decodeURIComponent(encodedHash);
    } catch {
      // Keep the original hash when it contains malformed escape sequences.
    }
    const restoreKey = `${document.path}#${hash}`;
    if (restoredHashRef.current === restoreKey) return;
    const animationFrame = window.requestAnimationFrame(() => {
      const target = window.document.getElementById(hash);
      if (!target) return;
      target.scrollIntoView();
      restoredHashRef.current = restoreKey;
    });
    return () => window.cancelAnimationFrame(animationFrame);
  }, [document.path, visibleSegments]);

  const components = useMemo(
    () => ({
      pre: MarkdownPre,
      img: ({ src = "", alt = "" }: { src?: string; alt?: string }) => {
        const resolved = isExternal(src)
          ? src
          : fileUrl(resolveRelativePath(document.path, decodeMarkdownUrl(src)));
        return <MarkdownImage src={resolved} alt={alt} />;
      },
      a: ({
        href = "",
        children,
      }: {
        href?: string;
        children?: ReactNode;
      }) => {
        if (href.startsWith("#")) return <a href={href}>{children}</a>;
        if (isExternal(href)) {
          return (
            <a href={href} target="_blank" rel="noreferrer">
              {children}
              <ExternalLink className="external-link-icon" aria-label="外部链接" />
            </a>
          );
        }

        const targetPath = resolveRelativePath(
          document.path,
          decodeMarkdownUrl(href),
        );
        const readerHref = `?doc=${encodeURIComponent(targetPath)}`;
        if (/\.(md|markdown|mdown)$/i.test(targetPath)) {
          return (
            <a
              href={readerHref}
              onClick={(event) => {
                event.preventDefault();
                onNavigate(targetPath);
              }}
            >
              {children}
            </a>
          );
        }
        return (
          <a
            href={fileUrl(targetPath)}
            target="_blank"
            rel="noreferrer"
            onClick={(event) => {
              if (onNavigate(targetPath)) event.preventDefault();
            }}
          >
            {children}
          </a>
        );
      },
    }),
    [document.path, onNavigate],
  );

  return (
    <article
      className="markdown-body"
      style={{ "--reader-scale": fontScale } as CSSProperties}
    >
      {segments.slice(0, visibleSegments).map((segment, index) => (
        <ReactMarkdown
          key={`${document.path}-${index}`}
          remarkPlugins={[
            remarkGfm,
            remarkMath,
            remarkAlerts,
            remarkNormalizeRawHtml,
          ]}
          rehypePlugins={[
            rehypeSlug,
            [rehypeStableHeadingIds, { headings: segment.headings }],
            rehypeKatex,
          ]}
          remarkRehypeOptions={{
            footnoteLabel: "脚注",
            footnoteBackLabel: "返回正文",
          }}
          components={components}
        >
          {segment.content}
        </ReactMarkdown>
      ))}
      {visibleSegments < segments.length && (
        <div className="markdown-render-progress" role="status">
          <span>
            正在分段渲染大型文档：{visibleSegments}/{segments.length}
          </span>
          <button onClick={() => setVisibleSegments(segments.length)}>
            立即显示全部
          </button>
        </div>
      )}
    </article>
  );
}
