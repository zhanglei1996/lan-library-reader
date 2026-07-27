import { FileSearch } from "lucide-react";
import type { FileNode, SearchResponse } from "../types";

export default function SearchResults({
  response,
  loading,
  onSelect,
}: {
  response?: SearchResponse;
  loading: boolean;
  onSelect: (file: FileNode) => void;
}) {
  if (loading) return <div className="search-state">正在搜索正文…</div>;
  if (!response) return null;
  if (response.results.length === 0) {
    return <div className="search-state">没有找到正文匹配</div>;
  }
  return (
    <div className="search-results">
      <div className="search-summary">
        找到 {response.results.length} 项
        {response.truncated ? "（结果已截断）" : ""}
      </div>
      {response.results.map((result) => (
        <button
          key={result.path}
          onClick={() => onSelect({
            type: "file",
            path: result.path,
            name: result.name,
            kind: result.kind,
            language: result.language,
          })}
        >
          <FileSearch aria-hidden="true" />
          <span>
            <strong>{result.name}</strong>
            <small>{result.snippet}</small>
          </span>
        </button>
      ))}
    </div>
  );
}
