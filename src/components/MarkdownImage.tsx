import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import {
  ExternalLink,
  Maximize2,
  Minus,
  Plus,
  RotateCcw,
  X,
} from "lucide-react";

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.25;
const WHEEL_ZOOM_SENSITIVITY = 0.003;
const MAX_WHEEL_DELTA = 24;

export default function MarkdownImage({
  src,
  alt,
}: {
  src: string;
  alt: string;
}) {
  const [open, setOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  function changeZoom(next: number) {
    setZoom(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next)));
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await dialogRef.current?.requestFullscreen();
    } catch {
      // The modal itself still fills the viewport when native fullscreen is unavailable.
    }
  }

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
      else if (event.key === "+" || event.key === "=") {
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

  const lightbox = open
    ? createPortal(
        <div
          className="image-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={alt || "图片预览"}
          ref={dialogRef}
        >
          <div className="image-lightbox-toolbar">
            <button
              onClick={() => changeZoom(zoom - ZOOM_STEP)}
              disabled={zoom <= MIN_ZOOM}
              aria-label="缩小图片"
            >
              <Minus />
            </button>
            <span>{Math.round(zoom * 100)}%</span>
            <button
              onClick={() => changeZoom(zoom + ZOOM_STEP)}
              disabled={zoom >= MAX_ZOOM}
              aria-label="放大图片"
            >
              <Plus />
            </button>
            <button onClick={() => setZoom(1)} aria-label="重置图片大小">
              <RotateCcw />
            </button>
            <button onClick={() => void toggleFullscreen()} aria-label="切换全屏">
              <Maximize2 />
              <span>{fullscreen ? "退出全屏" : "全屏"}</span>
            </button>
            <a href={src} target="_blank" rel="noreferrer" aria-label="查看原图">
              <ExternalLink />
              <span>原图</span>
            </a>
            <button
              className="image-lightbox-close"
              onClick={() => setOpen(false)}
              aria-label="关闭图片预览"
            >
              <X />
            </button>
          </div>
          <div
            className="image-lightbox-stage"
            onClick={(event) => {
              if (event.currentTarget === event.target) setOpen(false);
            }}
          >
            <img
              src={src}
              alt={alt}
              style={{ transform: `scale(${zoom})` }}
              onDoubleClick={() => changeZoom(zoom === 1 ? 2 : 1)}
            />
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <>
      <img
        className="markdown-preview-image"
        src={src}
        alt={alt}
        loading="lazy"
        role="button"
        tabIndex={0}
        title="点击放大图片"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setZoom(1);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            event.stopPropagation();
            setZoom(1);
            setOpen(true);
          }
        }}
      />
      {lightbox}
    </>
  );
}
