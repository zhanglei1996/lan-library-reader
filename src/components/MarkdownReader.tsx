import { useMemo } from "react";
import type { CSSProperties, ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";
import { ExternalLink } from "lucide-react";
import { fileUrl, resolveRelativePath } from "../lib/path";
import type { MarkdownDocument } from "../types";

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

export default function MarkdownReader({
  document,
  fontScale,
  onNavigate,
}: MarkdownReaderProps) {
  const components = useMemo(
    () => ({
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
