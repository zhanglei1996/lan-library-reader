import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { X } from "lucide-react";

export default function ShareDialog({
  urls,
  onClose,
}: {
  urls: string[];
  onClose: () => void;
}) {
  const [url, setUrl] = useState(urls[0] ?? "");
  const [image, setImage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    setImage("");
    setError("");
    if (!url) {
      setError("没有可用于生成二维码的地址");
      return () => {
        cancelled = true;
      };
    }
    void QRCode.toDataURL(url, {
      width: 280,
      margin: 2,
      color: { dark: "#13251d", light: "#ffffff" },
    }).then((nextImage) => {
      if (!cancelled) setImage(nextImage);
    }).catch(() => {
      if (!cancelled) setError("二维码生成失败，请复制下方地址");
    });
    return () => {
      cancelled = true;
    };
  }, [url]);
  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <section
        className="share-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="扫码打开当前文档"
        onClick={(event) => event.stopPropagation()}
      >
        <button className="dialog-close" onClick={onClose} aria-label="关闭">
          <X />
        </button>
        <h2>扫码打开当前文档</h2>
        {urls.length > 1 && (
          <select
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            aria-label="选择局域网地址"
          >
            {urls.map((item) => (
              <option key={item} value={item}>{new URL(item).host}</option>
            ))}
          </select>
        )}
        {image
          ? <img src={image} alt="当前文档二维码" />
          : !error && <p>正在生成二维码…</p>}
        {error && <p role="alert">{error}</p>}
        <code>{url}</code>
      </section>
    </div>
  );
}
