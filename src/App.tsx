import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpenText,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Link2,
  LogOut,
  Menu,
  Minus,
  Moon,
  Plus,
  QrCode,
  RefreshCw,
  Search,
  Sun,
  X,
} from "lucide-react";
import LibraryTree from "./components/LibraryTree";
import LoginPage from "./components/LoginPage";
import MarkdownReader from "./components/MarkdownReader";
import PdfReader from "./components/PdfReader";
import SearchResults from "./components/SearchResults";
import ShareDialog from "./components/ShareDialog";
import TextReader from "./components/TextReader";
import Welcome from "./components/Welcome";
import { copyText } from "./lib/clipboard";
import { extractHeadings } from "./lib/headings";
import { fileUrl } from "./lib/path";
import type {
  FileNode,
  LibraryInfo,
  LibrarySnapshot,
  MarkdownDocument,
  SearchResponse,
  TextDocument,
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

async function apiError(response: Response, fallback: string) {
  try {
    const payload = await response.json() as { error?: unknown };
    if (typeof payload.error === "string" && payload.error.trim()) {
      return payload.error;
    }
  } catch {
    // The fallback below is clearer than a JSON parsing error.
  }
  return fallback;
}

export default function App() {
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [info, setInfo] = useState<LibraryInfo | null>(null);
  const [selected, setSelected] = useState<FileNode>();
  const [markdown, setMarkdown] = useState<MarkdownDocument>();
  const [textDocument, setTextDocument] = useState<TextDocument>();
  const [query, setQuery] = useState("");
  const [searchResponse, setSearchResponse] = useState<SearchResponse>();
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [manualCopy, setManualCopy] = useState("");
  const [shareUrls, setShareUrls] = useState<string[]>([]);
  const [authReady, setAuthReady] = useState(false);
  const [authRequired, setAuthRequired] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [fontScale, setFontScale] = useState(1);
  const documentRequest = useRef(0);
  const documentAbort = useRef<AbortController | undefined>(undefined);
  const libraryRequest = useRef(0);
  const selectedPath = useRef<string | undefined>(undefined);
  const readerRef = useRef<HTMLElement>(null);
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
    const requestId = ++documentRequest.current;
    documentAbort.current?.abort();
    documentAbort.current = undefined;
    selectedPath.current = file.path;
    setSelected(file);
    setMarkdown(undefined);
    setTextDocument(undefined);
    setError("");
    setSidebarOpen(false);
    window.history.replaceState(null, "", `?doc=${encodeURIComponent(file.path)}`);

    if (file.kind === "markdown" || file.kind === "text") {
      const controller = new AbortController();
      documentAbort.current = controller;
      try {
        const response = await fetch(
          `/api/${file.kind === "markdown" ? "markdown" : "text"}?path=${encodeURIComponent(file.path)}`,
          { signal: controller.signal },
        );
        if (response.status === 401) {
          if (requestId !== documentRequest.current) return;
          setAuthenticated(false);
          setAuthRequired(true);
          return;
        }
        if (!response.ok) throw new Error(await apiError(response, "文档读取失败"));
        const document = await response.json();
        if (controller.signal.aborted || requestId !== documentRequest.current) return;
        if (file.kind === "markdown") setMarkdown(document as MarkdownDocument);
        else setTextDocument(document as TextDocument);
      } catch (reason) {
        if (controller.signal.aborted || requestId !== documentRequest.current) return;
        setError(reason instanceof Error ? reason.message : "文档读取失败");
      } finally {
        if (documentAbort.current === controller) documentAbort.current = undefined;
      }
    }
    readerRef.current?.scrollTo({ top: 0, behavior: "instant" });
  }, []);

  const loadLibrary = useCallback(async (
    keepSelection = true,
    forceRefresh = false,
  ) => {
    const requestId = ++libraryRequest.current;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/snapshot${forceRefresh ? "?refresh=1" : ""}`);
      if (response.status === 401) {
        if (requestId !== libraryRequest.current) return;
        setAuthRequired(true);
        setAuthenticated(false);
        return;
      }
      if (!response.ok) throw new Error(await apiError(response, "无法读取书架"));
      const snapshot = (await response.json()) as LibrarySnapshot;
      if (requestId !== libraryRequest.current) return;
      const nextTree = snapshot.tree;
      const nextInfo = snapshot.info;
      setTree(nextTree);
      setInfo(nextInfo);
      if (nextInfo.config.features.readingPosition) {
        const validPaths = new Set(flattenFiles(nextTree).map((file) => file.path));
        const prefix = `lan-reader-position:${nextInfo.name}:`;
        const staleKeys = [];
        for (let index = 0; index < localStorage.length; index += 1) {
          const key = localStorage.key(index);
          if (key?.startsWith(prefix) && !validPaths.has(key.slice(prefix.length))) {
            staleKeys.push(key);
          }
        }
        for (const key of staleKeys) localStorage.removeItem(key);
      }

      const requestedPath = new URLSearchParams(location.search).get("doc");
      const currentPath = keepSelection ? selectedPath.current : undefined;
      const nextFile =
        (currentPath && findFile(nextTree, currentPath))
        || (requestedPath && findFile(nextTree, requestedPath))
        || firstFile(nextTree);
      if (nextFile) await loadDocument(nextFile);
      else {
        selectedPath.current = undefined;
        setSelected(undefined);
        setMarkdown(undefined);
        setTextDocument(undefined);
      }
    } catch (reason) {
      if (requestId !== libraryRequest.current) return;
      setError(reason instanceof Error ? reason.message : "无法读取书架");
    } finally {
      if (requestId === libraryRequest.current) setLoading(false);
    }
  }, [loadDocument]);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/auth/status");
        const status = await response.json() as {
          required: boolean;
          authenticated: boolean;
        };
        setAuthRequired(status.required);
        setAuthenticated(status.authenticated);
        if (!status.required || status.authenticated) await loadLibrary(false);
        else setLoading(false);
      } catch {
        setError("无法连接到 LAN Reader 服务");
        setLoading(false);
      } finally {
        setAuthReady(true);
      }
    })();
  }, []);

  useEffect(() => () => {
    documentAbort.current?.abort();
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("lan-reader-theme", theme);
  }, [theme]);

  useEffect(() => {
    if (
      !authenticated
      || !info?.capabilities.autoRefresh
      || !info.config.features.autoRefresh
    ) return undefined;
    const events = new EventSource("/api/events");
    let timer = 0;
    events.addEventListener("library-change", () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void loadLibrary(), 250);
    });
    return () => {
      window.clearTimeout(timer);
      events.close();
    };
  }, [authenticated, info?.capabilities.autoRefresh, info?.config.features.autoRefresh, loadLibrary]);

  useEffect(() => {
    const searchEnabled = info?.config.features.fullTextSearch;
    if (!searchEnabled || query.trim().length < 1) {
      setSearchResponse(undefined);
      setSearching(false);
      return undefined;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(await apiError(response, "搜索失败"));
        setSearchResponse(await response.json());
      } catch (reason) {
        if (!(reason instanceof DOMException && reason.name === "AbortError")) {
          setError(reason instanceof Error ? reason.message : "搜索失败");
        }
      } finally {
        setSearching(false);
      }
    }, 280);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [info?.config.features.fullTextSearch, query]);

  useEffect(() => {
    if (!selected || !info?.config.features.readingPosition) return undefined;
    if (selected.kind === "markdown" && !markdown) return undefined;
    if (selected.kind === "text" && !textDocument) return undefined;
    const reader = readerRef.current;
    if (!reader) return undefined;
    const key = `lan-reader-position:${info.name}:${selected.path}`;
    const saved = Number(localStorage.getItem(key));
    const restoreTimer = window.setTimeout(() => {
      if (Number.isFinite(saved) && saved > 0) reader.scrollTo({ top: saved });
    }, 80);
    let saveTimer = 0;
    const save = () => {
      window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(() => {
        localStorage.setItem(key, String(reader.scrollTop));
      }, 120);
    };
    reader.addEventListener("scroll", save, { passive: true });
    return () => {
      window.clearTimeout(restoreTimer);
      window.clearTimeout(saveTimer);
      localStorage.setItem(key, String(reader.scrollTop));
      reader.removeEventListener("scroll", save);
    };
  }, [
    info?.config.features.readingPosition,
    info?.name,
    markdown?.modifiedAt,
    selected?.kind,
    selected?.path,
    textDocument?.modifiedAt,
  ]);

  async function copyValue(value: string, successMessage: string) {
    if (value.length > 2 * 1024 * 1024 && !window.confirm("内容较大，复制可能需要一些时间。继续吗？")) {
      return;
    }
    if (!await copyText(value)) {
      setManualCopy(value);
      return;
    }
    setNotice(successMessage);
    window.setTimeout(() => setNotice(""), 1_600);
  }

  function currentDocumentUrls() {
    const current = new URL(location.href);
    const bases = (
      (current.hostname === "localhost" || current.hostname === "127.0.0.1")
      && info?.accessUrls[0]
    )
      ? info.accessUrls
      : [current.origin, ...(info?.accessUrls ?? [])];
    return [...new Set(bases)].map((base) => {
      const url = new URL(current.pathname, base);
      url.search = selected ? `?doc=${encodeURIComponent(selected.path)}` : "";
      return url.toString();
    });
  }

  function currentDocumentUrl() {
    return currentDocumentUrls()[0] ?? location.href;
  }

  async function logout() {
    libraryRequest.current += 1;
    documentRequest.current += 1;
    documentAbort.current?.abort();
    selectedPath.current = undefined;
    await fetch("/api/auth/logout", { method: "POST" });
    setAuthenticated(false);
    setInfo(null);
    setTree([]);
    setSelected(undefined);
  }

  function navigateBy(offset: number) {
    const target = files[selectedIndex + offset];
    if (target) void loadDocument(target);
  }

  const isOffice = selected?.kind === "word" || selected?.kind === "powerpoint";
  const officeUrl = selected
    ? `/api/office?path=${encodeURIComponent(selected.path)}`
    : "";
  const copyableContent = markdown?.content ?? textDocument?.content;

  if (!authReady) {
    return <div className="loading-page standalone">正在连接书架…</div>;
  }
  if (authRequired && !authenticated) {
    return (
      <LoginPage
        onAuthenticated={() => {
          setAuthenticated(true);
          void loadLibrary(false);
        }}
      />
    );
  }

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
          {info?.config.features.qrCode && (
            <button
              className="icon-button"
              onClick={() => setShareUrls(currentDocumentUrls())}
              aria-label="显示二维码"
              title="显示二维码"
            >
              <QrCode />
            </button>
          )}
          {authRequired && (
            <button
              className="icon-button"
              onClick={() => void logout()}
              aria-label="退出书架"
              title="退出书架"
            >
              <LogOut />
            </button>
          )}
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
            placeholder="搜索文件名和正文"
            aria-label="搜索文件名和正文"
          />
          {query && (
            <button onClick={() => setQuery("")} aria-label="清空搜索">
              <X />
            </button>
          )}
        </label>
        <div className="tree-scroll">
          {info?.config.features.fullTextSearch && query.trim().length >= 1 ? (
            <SearchResults
              response={searchResponse}
              loading={searching}
              onSelect={(file) => void loadDocument(file)}
            />
          ) : (
            <LibraryTree
              nodes={tree}
              selectedPath={selected?.path}
              query={query}
              onSelect={(file) => void loadDocument(file)}
            />
          )}
        </div>
        <div className="sidebar-foot">
          <span>
            {info?.capabilities.officePreview
              ? "Office 预览已就绪"
              : "Office 预览需安装 LibreOffice"}
            {info && info.scan.unreadableDirectoryCount > 0
              ? `；已跳过 ${info.scan.unreadableDirectoryCount} 个无法读取的目录`
              : ""}
            {info && info.scan.depthLimitedDirectoryCount > 0
              ? `；已跳过 ${info.scan.depthLimitedDirectoryCount} 个过深目录`
              : ""}
            {info && info.config.warnings.length > 0
              ? `；${info.config.warnings.join("；")}`
              : ""}
          </span>
          <button onClick={() => void loadLibrary(true, true)} disabled={loading}>
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

      <main className="reader" ref={readerRef}>
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
              {copyableContent && info?.config.features.copy && (
                <button
                  className="icon-button"
                  onClick={() => void copyValue(copyableContent, "已复制全文")}
                  aria-label="复制全文"
                  title="复制全文"
                >
                  <Copy />
                </button>
              )}
              {info?.config.features.copy && (
                <button
                  className="icon-button"
                  onClick={() => void copyValue(currentDocumentUrl(), "已复制文档链接")}
                  aria-label="复制文档链接"
                  title="复制文档链接"
                >
                  <Link2 />
                </button>
              )}
              {info?.config.features.download && (
                <a
                  className="icon-button"
                  href={fileUrl(selected.path, true)}
                  aria-label="下载原文件"
                  title="下载原文件"
                  download
                >
                  <Download />
                </a>
              )}
              {(selected.kind === "markdown" || selected.kind === "text") && (
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
          {notice && (
            <div className="notice-message">
              <Check /> {notice}
            </div>
          )}
          {error && <div className="error-message">{error}</div>}
          {!selected && !loading && !error && <Welcome empty={tree.length === 0} />}
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
          {selected?.kind === "text" && textDocument && info && (
            <TextReader
              key={textDocument.path}
              document={textDocument}
              fontScale={fontScale}
              initialLineNumbers={info.config.textPreview.lineNumbers}
              initialWrap={info.config.textPreview.wrap}
              syntaxHighlight={info.config.textPreview.syntaxHighlight}
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
              <a href={fileUrl(selected.path, true)} download>下载原文件</a>
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
      {shareUrls.length > 0 && (
        <ShareDialog urls={shareUrls} onClose={() => setShareUrls([])} />
      )}
      {manualCopy && (
        <div className="dialog-backdrop" role="presentation" onClick={() => setManualCopy("")}>
          <section
            className="manual-copy-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="手动复制"
            onClick={(event) => event.stopPropagation()}
          >
            <h2>请长按复制</h2>
            <p>当前浏览器不允许网页自动写入剪贴板。</p>
            <textarea
              value={manualCopy}
              readOnly
              autoFocus
              onFocus={(event) => event.currentTarget.select()}
            />
            <button onClick={() => setManualCopy("")}>完成</button>
          </section>
        </div>
      )}
    </div>
  );
}
