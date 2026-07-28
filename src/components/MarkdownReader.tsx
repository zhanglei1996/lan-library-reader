import { isValidElement, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";
import { Check, Copy, ExternalLink } from "lucide-react";
import { copyText } from "../lib/clipboard";
import { fileUrl, resolveRelativePath } from "../lib/path";
import type { MarkdownDocument } from "../types";
import MermaidDiagram from "./MermaidDiagram";

interface MarkdownReaderProps {
  document: MarkdownDocument;
  fontScale: number;
  onNavigate: (path: string) => void;
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

function CopyableCodeBlock({ children }: { children?: ReactNode }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    if (!await copyText(nodeText(children).replace(/\n$/, ""))) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  }
  return (
    <div className="code-block">
      <button onClick={() => void copy()} aria-label="复制代码">
        {copied ? <Check /> : <Copy />}
        {copied ? "已复制" : "复制"}
      </button>
      <pre>{children}</pre>
    </div>
  );
}

function MarkdownPre({ children }: { children?: ReactNode }) {
  if (isValidElement<{ className?: string; children?: ReactNode }>(children)) {
    const languages = children.props.className?.split(/\s+/) ?? [];
    if (languages.includes("language-mermaid")) {
      return (
        <MermaidDiagram
          source={nodeText(children.props.children).replace(/\n$/, "")}
        />
      );
    }
  }
  return <CopyableCodeBlock>{children}</CopyableCodeBlock>;
}

export default function MarkdownReader({
  document,
  fontScale,
  onNavigate,
}: MarkdownReaderProps) {
  const components = useMemo(
    () => ({
      pre: MarkdownPre,
      img: ({ src = "", alt = "" }: { src?: string; alt?: string }) => {
        const resolved = isExternal(src)
          ? src
          : fileUrl(resolveRelativePath(document.path, decodeMarkdownUrl(src)));
        return <img src={resolved} alt={alt} loading="lazy" />;
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
        if (/\.(md|markdown|mdown)$/i.test(targetPath)) {
          return (
            <a
              href={`?doc=${encodeURIComponent(targetPath)}`}
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
          <a href={fileUrl(targetPath)} target="_blank" rel="noreferrer">
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
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSlug]}
        components={components}
      >
        {document.content}
      </ReactMarkdown>
    </article>
  );
}
