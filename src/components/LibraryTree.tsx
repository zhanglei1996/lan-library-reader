import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  Image as ImageIcon,
  Presentation,
  ScrollText,
} from "lucide-react";
import type { FileNode, TreeNode } from "../types";

interface LibraryTreeProps {
  nodes: TreeNode[];
  selectedPath?: string;
  revealedDirectoryPath?: string;
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
  if (kind === "image") return <ImageIcon aria-hidden="true" />;
  return <FileText aria-hidden="true" />;
}

function ancestorPaths(path: string, includeTarget: boolean) {
  const parts = path.split("/").filter(Boolean);
  const length = includeTarget ? parts.length : Math.max(0, parts.length - 1);
  return Array.from({ length }, (_, index) =>
    parts.slice(0, index + 1).join("/"));
}

function TreeItem({
  node,
  level,
  selectedPath,
  revealedDirectoryPath,
  query,
  openFolders,
  toggleFolder,
  onSelect,
}: {
  node: TreeNode;
  level: number;
  selectedPath?: string;
  revealedDirectoryPath?: string;
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
        className={`tree-folder-button ${
          revealedDirectoryPath === node.path ? "is-revealed" : ""
        }`}
        style={{ paddingLeft: `${10 + level * 18}px` }}
        onClick={() => toggleFolder(node.path)}
        aria-expanded={isOpen}
        title={node.name}
        data-path={node.path}
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
              revealedDirectoryPath={revealedDirectoryPath}
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
  revealedDirectoryPath,
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
  const treeRef = useRef<HTMLElement>(null);
  const lastAutoLocatedTarget = useRef("");

  useEffect(() => setOpenFolders(initialFolders), [initialFolders]);

  useEffect(() => {
    const paths = revealedDirectoryPath
      ? ancestorPaths(revealedDirectoryPath, true)
      : selectedPath
        ? ancestorPaths(selectedPath, false)
        : [];
    if (paths.length === 0) return;
    setOpenFolders((current) => {
      const next = new Set(current);
      let changed = false;
      for (const path of paths) {
        if (next.has(path)) continue;
        next.add(path);
        changed = true;
      }
      return changed ? next : current;
    });
  }, [initialFolders, revealedDirectoryPath, selectedPath]);

  useEffect(() => {
    const targetPath = revealedDirectoryPath ?? selectedPath;
    if (!targetPath) return;
    const targetKey = `${revealedDirectoryPath ? "directory" : "file"}:${targetPath}`;
    if (lastAutoLocatedTarget.current === targetKey) return;
    const requiredPaths = ancestorPaths(targetPath, Boolean(revealedDirectoryPath));
    if (!requiredPaths.every((path) => openFolders.has(path))) return;
    const frame = window.requestAnimationFrame(() => {
      const elements = treeRef.current
        ?.querySelectorAll<HTMLButtonElement>("[data-path]");
      const target = [...(elements ?? [])]
        .find((element) => element.dataset.path === targetPath);
      target?.scrollIntoView({ block: "center" });
      if (revealedDirectoryPath) target?.focus({ preventScroll: true });
      if (target) lastAutoLocatedTarget.current = targetKey;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [openFolders, revealedDirectoryPath, selectedPath]);

  function toggleFolder(path: string) {
    setOpenFolders((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  return (
    <nav className="library-tree" aria-label="文档目录" ref={treeRef}>
      {nodes.map((node) => (
        <TreeItem
          key={node.path}
          node={node}
          level={0}
          selectedPath={selectedPath}
          revealedDirectoryPath={revealedDirectoryPath}
          query={query.toLocaleLowerCase()}
          openFolders={openFolders}
          toggleFolder={toggleFolder}
          onSelect={onSelect}
        />
      ))}
    </nav>
  );
}
