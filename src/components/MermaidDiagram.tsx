import { createPortal } from "react-dom";
import { useEffect, useId, useRef, useState } from "react";
import { Maximize2, Minus, Plus, RotateCcw, X } from "lucide-react";

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.1;
const WHEEL_ZOOM_SENSITIVITY = 0.003;
const MAX_WHEEL_DELTA = 24;

interface MermaidDiagramProps {
  source: string;
}

type DiagramState =
  | { status: "loading" }
  | { status: "ready"; svg: string }
  | { status: "error"; message: string };

export default function MermaidDiagram({ source }: MermaidDiagramProps) {
  const reactId = useId();
  const [state, setState] = useState<DiagramState>({ status: "loading" });
  const [open, setOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  function changeZoom(next: number) {
    setZoom(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next)));
  }

  function openViewer() {
    setZoom(1);
    setOpen(true);
  }

  async function closeViewer() {
    try {
      if (document.fullscreenElement === dialogRef.current) {
        await document.exitFullscreen();
      }
    } catch {
      // Closing the modal must still work when the Fullscreen API is unavailable.
    }
    setFullscreen(false);
    setOpen(false);
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement === dialogRef.current) {
        await document.exitFullscreen();
      } else {
        await dialogRef.current?.requestFullscreen();
      }
    } catch {
      // The modal itself still fills the viewport when native fullscreen is unavailable.
    }
  }

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });

    void (async () => {
      try {
        const { default: mermaid } = await import("mermaid");
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: "neutral",
          suppressErrorRendering: true,
        });
        const diagramId = `lan-reader-mermaid-${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
        const { svg } = await mermaid.render(diagramId, source);
        if (!cancelled) setState({ status: "ready", svg });
      } catch (reason) {
        if (cancelled) return;
        const message = reason instanceof Error ? reason.message : "Mermaid 语法无效";
        setState({ status: "error", message });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [reactId, source]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        void closeViewer();
      } else if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        setZoom((current) => Math.min(MAX_ZOOM, current + ZOOM_STEP));
      } else if (event.key === "-") {
        event.preventDefault();
        setZoom((current) => Math.max(MIN_ZOOM, current - ZOOM_STEP));
      } else if (event.key === "0") {
        event.preventDefault();
        setZoom(1);
      }
    };
    const onFullscreenChange = () => {
      setFullscreen(document.fullscreenElement === dialogRef.current);
    };
    const dialog = dialogRef.current;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;

      // React delegates wheel handlers as passive listeners in some browsers.
      // A native non-passive listener is required to stop the browser's own
      // page zoom while the Mermaid viewer is open.
      event.preventDefault();
      event.stopPropagation();

      const modeMultiplier = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 100 : 1;
      const normalizedDelta = event.deltaY * modeMultiplier;
      const limitedDelta = Math.min(
        MAX_WHEEL_DELTA,
        Math.max(-MAX_WHEEL_DELTA, normalizedDelta),
      );
      setZoom((current) => {
        const next = current * Math.exp(-limitedDelta * WHEEL_ZOOM_SENSITIVITY);
        const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
        return Math.round(clamped * 1000) / 1000;
      });
    };
    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    dialog?.addEventListener("wheel", onWheel, { passive: false, capture: true });
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      dialog?.removeEventListener("wheel", onWheel, { capture: true });
    };
  }, [open]);

  if (state.status === "loading") {
    return <div className="mermaid-status">正在生成流程图…</div>;
  }

  if (state.status === "error") {
    return (
      <div className="mermaid-error">
        <strong>流程图无法渲染</strong>
        <span>{state.message}</span>
        <pre><code>{source}</code></pre>
      </div>
    );
  }

  const viewer = open
    ? createPortal(
        <div
          className="image-lightbox mermaid-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="Mermaid 流程图大图预览"
          ref={dialogRef}
        >
          <div className="image-lightbox-toolbar">
            <button
              onClick={() => changeZoom(zoom - ZOOM_STEP)}
              disabled={zoom <= MIN_ZOOM}
              aria-label="缩小流程图"
            >
              <Minus />
            </button>
            <span>{Math.round(zoom * 100)}%</span>
            <button
              onClick={() => changeZoom(zoom + ZOOM_STEP)}
              disabled={zoom >= MAX_ZOOM}
              aria-label="放大流程图"
            >
              <Plus />
            </button>
            <button onClick={() => setZoom(1)} aria-label="重置流程图大小">
              <RotateCcw />
            </button>
            <button onClick={() => void toggleFullscreen()} aria-label="切换全屏">
              <Maximize2 />
              <span>{fullscreen ? "退出全屏" : "全屏"}</span>
            </button>
            <button
              className="image-lightbox-close"
              onClick={() => void closeViewer()}
              aria-label="关闭流程图预览"
            >
              <X />
            </button>
          </div>
          <div className="mermaid-lightbox-stage">
            <div
              className="mermaid-lightbox-canvas"
              style={{ width: `${zoom * 100}%` }}
              onDoubleClick={() => changeZoom(zoom === 1 ? 2 : 1)}
              dangerouslySetInnerHTML={{ __html: state.svg }}
            />
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <div className="mermaid-preview">
      <div className="mermaid-preview-toolbar">
        <button onClick={openViewer} aria-label="放大查看 Mermaid 流程图">
          <Maximize2 />
          <span>放大查看</span>
        </button>
      </div>
      <div
        className="mermaid-diagram"
        role="button"
        tabIndex={0}
        title="点击放大流程图"
        aria-label="打开 Mermaid 流程图大图预览"
        onClick={openViewer}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openViewer();
          }
        }}
        dangerouslySetInnerHTML={{ __html: state.svg }}
      />
      {viewer}
    </div>
  );
}
