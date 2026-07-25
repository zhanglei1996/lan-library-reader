import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BookOpenText,
  ChevronLeft,
  ChevronRight,
  Menu,
  Minus,
  Moon,
  Plus,
  RefreshCw,
  Search,
  Sun,
  X,
} from "lucide-react";
import LibraryTree from "./components/LibraryTree";
import MarkdownReader from "./components/MarkdownReader";
import PdfReader from "./components/PdfReader";
import Welcome from "./components/Welcome";
import { extractHeadings } from "./lib/headings";
import { fileUrl } from "./lib/path";
import type {
  FileNode,
  LibraryInfo,
  MarkdownDocument,
  TreeNode,
} from "./types";

function findFile(nodes: TreeNode[], path: string): FileNode | undefined {
  for (const node of nodes) {
    if (node.type === "file" && node.path === path) return node;
    if (node.type === "directory") {
      const found = findFile(node.children, path);
      if (found) return found;
    }
  }
  return undefined;
}

function firstFile(nodes: TreeNode[]): FileNode | undefined {
  const rootFile = nodes.find((node): node is FileNode => node.type === "file");
  if (rootFile) return rootFile;
  for (const node of nodes) {
    if (node.type === "file") continue;
    const nested = firstFile(node.children);
    if (nested) return nested;
  }
  return undefined;
}

function flattenFiles(nodes: TreeNode[]): FileNode[] {
  return nodes.flatMap((node) =>
    node.type === "file" ? [node] : flattenFiles(node.children),
  );
}

export default function App() {
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [info, setInfo] = useState<LibraryInfo | null>(null);
  const [selected, setSelected] = useState<FileNode>();
  const [markdown, setMarkdown] = useState<MarkdownDocument>();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [fontScale, setFontScale] = useState(1);
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const saved = localStorage.getItem("lan-reader-theme");
    if (saved === "dark" || saved === "light") return saved;
    return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });

  const headings = useMemo(
    () => (markdown ? extractHeadings(markdown.content) : []),
    [markdown],
  );
  const files = useMemo(() => flattenFiles(tree), [tree]);
  const selectedIndex = selected
    ? files.findIndex((file) => file.path === selected.path)
    : -1;

  const loadDocument = useCallback(async (file: FileNode) => {
    setSelected(file);
    setMarkdown(undefined);
    setError("");
    setSidebarOpen(false);
    window.history.replaceState(null, "", `?doc=${encodeURIComponent(file.path)}`);

    if (file.kind === "markdown") {
      try {
        const response = await fetch(
          `/api/markdown?path=${encodeURIComponent(file.path)}`,
        );
        if (!response.ok) throw new Error("文档读取失败");
        setMarkdown(await response.json());
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "文档读取失败");
      }
    }
    window.scrollTo({ top: 0, behavior: "instant" });
  }, []);

  const loadLibrary = useCallback(async (keepSelection = true) => {
    setLoading(true);
    setError("");
    try {
      const [treeResponse, infoResponse] = await Promise.all([
        fetch("/api/tree"),
        fetch("/api/library"),
      ]);
      if (!treeResponse.ok || !infoResponse.ok) throw new Error("无法读取书架");
      const nextTree = (await treeResponse.json()) as TreeNode[];
      const nextInfo = (await infoResponse.json()) as LibraryInfo;
      setTree(nextTree);
      setInfo(nextInfo);

      const requestedPath = new URLSearchParams(location.search).get("doc");
      const currentPath = keepSelection ? selected?.path : undefined;
      const nextFile =
        (currentPath && findFile(nextTree, currentPath))
        || (requestedPath && findFile(nextTree, requestedPath))
        || firstFile(nextTree);
      if (nextFile) await loadDocument(nextFile);
      else {
        setSelected(undefined);
        setMarkdown(undefined);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "无法读取书架");
    } finally {
      setLoading(false);
    }
  }, [loadDocument, selected?.path]);

  useEffect(() => {
    void loadLibrary(false);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("lan-reader-theme", theme);
  }, [theme]);

  function navigateBy(offset: number) {
    const target = files[selectedIndex + offset];
    if (target) void loadDocument(target);
  }

  const isOffice = selected?.kind === "word" || selected?.kind === "powerpoint";
  const officeUrl = selected
    ? `/api/office?path=${encodeURIComponent(selected.path)}`
    : "";

  return (
    <div className="app-shell">
      <header className="topbar">
        <button
          className="icon-button mobile-only"
          onClick={() => setSidebarOpen(true)}
          aria-label="打开文档目录"
        >
          <Menu />
        </button>
        <div className="brand">
          <span className="brand-mark"><BookOpenText aria-hidden="true" /></span>
          <div>
            <strong>局域网书架</strong>
            <span>{info?.name || "正在连接…"}</span>
          </div>
        </div>
        <div className="topbar-actions">
          {headings.length > 0 && (
            <button
              className="text-button outline-mobile-button"
              onClick={() => setOutlineOpen(true)}
            >
              本页目录
            </button>
          )}
          <button
            className="icon-button"
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            aria-label={theme === "light" ? "切换深色模式" : "切换浅色模式"}
          >
            {theme === "light" ? <Moon /> : <Sun />}
          </button>
        </div>
      </header>

      <aside className={`sidebar ${sidebarOpen ? "is-open" : ""}`}>
        <div className="sidebar-head">
          <div>
            <span className="sidebar-label">文档库</span>
            <strong>{info?.documentCount ?? 0} 篇文档</strong>
          </div>
          <button
            className="icon-button mobile-only"
            onClick={() => setSidebarOpen(false)}
            aria-label="关闭文档目录"
          >
            <X />
          </button>
        </div>
        <label className="search-box">
          <Search aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索文件名"
            aria-label="搜索文件名"
          />
          {query && (
            <button onClick={() => setQuery("")} aria-label="清空搜索">
              <X />
            </button>
          )}
        </label>
        <div className="tree-scroll">
          <LibraryTree
            nodes={tree}
            selectedPath={selected?.path}
            query={query}
            onSelect={(file) => void loadDocument(file)}
          />
        </div>
        <div className="sidebar-foot">
          <span>
            {info?.capabilities.officePreview
              ? "Office 预览已就绪"
              : "Office 预览需安装 LibreOffice"}
          </span>
          <button onClick={() => void loadLibrary()} disabled={loading}>
            <RefreshCw className={loading ? "is-spinning" : ""} />
            刷新书架
          </button>
        </div>
      </aside>

      {sidebarOpen && (
        <button
          className="backdrop"
          onClick={() => setSidebarOpen(false)}
          aria-label="关闭文档目录"
        />
      )}

      <main className="reader">
        {selected && (
          <div className="reader-toolbar">
            <div className="document-identity">
              <span>
                {selected.kind === "markdown"
                  ? "MARKDOWN"
                  : selected.kind.toUpperCase()}
              </span>
              <strong>{selected.name}</strong>
            </div>
            <div className="reading-controls">
              {selected.kind === "markdown" && (
                <div className="font-controls" aria-label="正文字号">
                  <button
                    onClick={() => setFontScale(Math.max(0.85, fontScale - 0.1))}
                    aria-label="缩小字号"
                  >
                    <Minus />
                  </button>
                  <span>{Math.round(fontScale * 100)}%</span>
                  <button
                    onClick={() => setFontScale(Math.min(1.3, fontScale + 0.1))}
                    aria-label="放大字号"
                  >
                    <Plus />
                  </button>
                </div>
              )}
              <button
                className="icon-button"
                disabled={selectedIndex <= 0}
                onClick={() => navigateBy(-1)}
                aria-label="上一篇文档"
              >
                <ChevronLeft />
              </button>
              <button
                className="icon-button"
                disabled={selectedIndex < 0 || selectedIndex >= files.length - 1}
                onClick={() => navigateBy(1)}
                aria-label="下一篇文档"
              >
                <ChevronRight />
              </button>
            </div>
          </div>
        )}

        <div
          className={`reader-content ${
            selected?.kind === "pdf" || isOffice ? "has-pdf" : ""
          }`}
        >
          {error && <div className="error-message">{error}</div>}
          {!selected && !loading && <Welcome empty={tree.length === 0} />}
          {loading && !selected && (
            <div className="loading-page">正在整理书架…</div>
          )}
          {selected?.kind === "markdown" && markdown && (
            <MarkdownReader
              document={markdown}
              fontScale={fontScale}
              onNavigate={(path) => {
                const target = findFile(tree, path);
                if (target) void loadDocument(target);
              }}
            />
          )}
          {selected?.kind === "pdf" && (
            <PdfReader url={fileUrl(selected.path)} name={selected.name} />
          )}
          {isOffice && info?.capabilities.officePreview && (
            <PdfReader url={officeUrl} name={selected.name} />
          )}
          {isOffice && !info?.capabilities.officePreview && (
            <section className="office-unavailable">
              <h1>需要 LibreOffice 才能预览</h1>
              <p>
                安装 LibreOffice 后重启服务，Word 和 PowerPoint
                会自动转换为缓存的 PDF，源文件不会被修改。
              </p>
              <a href={fileUrl(selected.path)}>下载原文件</a>
            </section>
          )}
        </div>
      </main>

      {headings.length > 0 && (
        <aside className={`outline ${outlineOpen ? "is-open" : ""}`}>
          <div className="outline-head">
            <span>本页目录</span>
            <button
              className="icon-button outline-close"
              onClick={() => setOutlineOpen(false)}
              aria-label="关闭本页目录"
            >
              <X />
            </button>
          </div>
          <nav aria-label="本页目录">
            {headings.map((heading) => (
              <a
                key={`${heading.id}-${heading.depth}`}
                href={`#${heading.id}`}
                style={{ paddingLeft: `${(heading.depth - 1) * 12}px` }}
                onClick={() => setOutlineOpen(false)}
              >
                {heading.text}
              </a>
            ))}
          </nav>
        </aside>
      )}

      {outlineOpen && (
        <button
          className="backdrop outline-backdrop"
          onClick={() => setOutlineOpen(false)}
          aria-label="关闭本页目录"
        />
      )}
    </div>
  );
}
