import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  Presentation,
  ScrollText,
} from "lucide-react";
import type { FileNode, TreeNode } from "../types";

interface LibraryTreeProps {
  nodes: TreeNode[];
  selectedPath?: string;
  query: string;
  onSelect: (file: FileNode) => void;
}

function containsMatch(node: TreeNode, query: string): boolean {
  if (!query) return true;
  if (node.name.toLocaleLowerCase().includes(query)) return true;
  return node.type === "directory"
    && node.children.some((child) => containsMatch(child, query));
}

function documentIcon(kind: FileNode["kind"]) {
  if (kind === "word") return <ScrollText aria-hidden="true" />;
  if (kind === "powerpoint") return <Presentation aria-hidden="true" />;
  return <FileText aria-hidden="true" />;
}

function TreeItem({
  node,
  level,
  selectedPath,
  query,
  openFolders,
  toggleFolder,
  onSelect,
}: {
  node: TreeNode;
  level: number;
  selectedPath?: string;
  query: string;
  openFolders: Set<string>;
  toggleFolder: (path: string) => void;
  onSelect: (file: FileNode) => void;
}) {
  if (!containsMatch(node, query)) return null;

  if (node.type === "file") {
    return (
      <button
        className={`tree-file ${selectedPath === node.path ? "is-active" : ""}`}
        style={{ paddingLeft: `${16 + level * 18}px` }}
        onClick={() => onSelect(node)}
        title={node.name}
        data-path={node.path}
      >
        <span className={`file-kind file-kind-${node.kind}`}>
          {documentIcon(node.kind)}
        </span>
        <span>{node.name}</span>
      </button>
    );
  }

  const isOpen = query ? true : openFolders.has(node.path);
  return (
    <div className="tree-folder">
      <button
        className="tree-folder-button"
        style={{ paddingLeft: `${10 + level * 18}px` }}
        onClick={() => toggleFolder(node.path)}
        aria-expanded={isOpen}
      >
        {isOpen
          ? <ChevronDown aria-hidden="true" />
          : <ChevronRight aria-hidden="true" />}
        {isOpen
          ? <FolderOpen aria-hidden="true" />
          : <Folder aria-hidden="true" />}
        <span>{node.name}</span>
      </button>
      {isOpen && (
        <div>
          {node.children.map((child) => (
            <TreeItem
              key={child.path}
              node={child}
              level={level + 1}
              selectedPath={selectedPath}
              query={query}
              openFolders={openFolders}
              toggleFolder={toggleFolder}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function LibraryTree({
  nodes,
  selectedPath,
  query,
  onSelect,
}: LibraryTreeProps) {
  const initialFolders = useMemo(() => {
    const paths = new Set<string>();
    for (const node of nodes) {
      if (node.type === "directory") paths.add(node.path);
    }
    return paths;
  }, [nodes]);
  const [openFolders, setOpenFolders] = useState(initialFolders);

  useEffect(() => setOpenFolders(initialFolders), [initialFolders]);

  function toggleFolder(path: string) {
    setOpenFolders((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  return (
    <nav className="library-tree" aria-label="文档目录">
      {nodes.map((node) => (
        <TreeItem
          key={node.path}
          node={node}
          level={0}
          selectedPath={selectedPath}
          query={query.toLocaleLowerCase()}
          openFolders={openFolders}
          toggleFolder={toggleFolder}
          onSelect={onSelect}
        />
      ))}
    </nav>
  );
}
