import { FileSearch, FolderSearch } from "lucide-react";
import type { SearchResponse, SearchResult } from "../types";

export default function SearchResults({
  response,
  loading,
  onSelect,
}: {
  response?: SearchResponse;
  loading: boolean;
  onSelect: (result: SearchResult) => void;
}) {
  if (loading) return <div className="search-state">正在搜索…</div>;
  if (!response) return null;
  if (response.results.length === 0) {
    return <div className="search-state">没有找到匹配项</div>;
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
          onClick={() => onSelect(result)}
          title={result.path}
          data-path={result.path}
          data-result-type={result.type}
        >
          {result.type === "directory"
            ? <FolderSearch aria-hidden="true" />
            : <FileSearch aria-hidden="true" />}
          <span>
            <strong>{result.name}</strong>
            <small>{result.snippet}</small>
          </span>
        </button>
      ))}
    </div>
  );
}
