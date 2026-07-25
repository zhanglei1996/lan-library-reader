import { ExternalLink } from "lucide-react";

export default function PdfReader({ url, name }: { url: string; name: string }) {
  return (
    <section className="pdf-reader" aria-label={`${name} PDF 预览`}>
      <div className="pdf-reader-bar">
        <span>PDF 预览</span>
        <a href={url} target="_blank" rel="noreferrer">
          单独打开
          <ExternalLink aria-hidden="true" />
        </a>
      </div>
      <iframe title={name} src={`${url}#view=FitH&toolbar=1`} />
    </section>
  );
}
