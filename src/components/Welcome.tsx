import { BookOpenText, FileText, ShieldCheck, Wifi } from "lucide-react";

export default function Welcome({ empty }: { empty: boolean }) {
  return (
    <section className="welcome">
      <div className="welcome-mark">
        <BookOpenText aria-hidden="true" />
      </div>
      <p className="eyebrow">你的本地阅读空间</p>
      <h1>{empty ? "这个书架还是空的" : "选一篇文档，开始阅读"}</h1>
      <p className="welcome-copy">
        {empty
          ? "把 Markdown、PDF、Word 或 PowerPoint 文件放进启动目录，然后刷新书架。"
          : "从左侧目录选择文档。阅读内容只在你的电脑和当前局域网中流动。"}
      </p>
      <div className="welcome-features">
        <div>
          <FileText aria-hidden="true" />
          <span>Markdown 与 PDF</span>
        </div>
        <div>
          <Wifi aria-hidden="true" />
          <span>手机和平板访问</span>
        </div>
        <div>
          <ShieldCheck aria-hidden="true" />
          <span>本地只读</span>
        </div>
      </div>
    </section>
  );
}
