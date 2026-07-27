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
  useEffect(() => {
    setImage("");
    void QRCode.toDataURL(url, {
      width: 280,
      margin: 2,
      color: { dark: "#13251d", light: "#ffffff" },
    }).then(setImage);
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
        {image ? <img src={image} alt="当前文档二维码" /> : <p>正在生成二维码…</p>}
        <code>{url}</code>
      </section>
    </div>
  );
}
