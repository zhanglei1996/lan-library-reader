import MarkdownImage from "./MarkdownImage";

export default function ImageReader({
  url,
  name,
}: {
  url: string;
  name: string;
}) {
  return (
    <section className="image-reader" aria-label={`图片预览：${name}`}>
      <MarkdownImage src={url} alt={name} />
      <p>点击图片可放大、缩放、全屏或查看原图</p>
    </section>
  );
}
