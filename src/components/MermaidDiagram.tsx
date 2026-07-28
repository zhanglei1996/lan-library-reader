import { useEffect, useId, useState } from "react";

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

  return (
    <div
      className="mermaid-diagram"
      role="img"
      aria-label="Mermaid 流程图"
      dangerouslySetInnerHTML={{ __html: state.svg }}
    />
  );
}
