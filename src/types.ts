export type DocumentKind =
  | "markdown"
  | "text"
  | "pdf"
  | "word"
  | "powerpoint"
  | "image";

export interface FileNode {
  type: "file";
  name: string;
  path: string;
  kind: DocumentKind;
  language?: string;
}

export interface DirectoryNode {
  type: "directory";
  name: string;
  path: string;
  children: TreeNode[];
}

export type TreeNode = FileNode | DirectoryNode;

export interface LibraryInfo {
  name: string;
  documentCount: number;
  revision: number;
  accessUrls: string[];
  config: ReaderConfig;
  scan: {
    scannedEntries: number;
    visitedEntries: number;
    ignoredEntries: number;
    unreadableDirectoryCount: number;
    unreadableDirectories: string[];
    depthLimitedDirectoryCount: number;
  };
  capabilities: {
    officePreview: boolean;
    officeProvider: string | null;
    autoRefresh: boolean;
    authentication: boolean;
  };
}

export interface LibrarySnapshot {
  tree: TreeNode[];
  info: LibraryInfo;
}

export interface MarkdownDocument {
  name: string;
  path: string;
  content: string;
  modifiedAt: string;
}

export interface TextDocument {
  name: string;
  path: string;
  content: string;
  encoding: string;
  language: string;
  size: number;
  modifiedAt: string;
}

export interface ReaderConfig {
  version: number;
  title: string | null;
  textPreview: {
    extensions: string[];
    maxBytes: number;
    lineNumbers: boolean;
    wrap: boolean;
    syntaxHighlight: boolean;
  };
  features: {
    copy: boolean;
    download: boolean;
    fullTextSearch: boolean;
    autoRefresh: boolean;
    readingPosition: boolean;
    qrCode: boolean;
  };
  warnings: string[];
}

export interface FileSearchResult {
  type: "file";
  path: string;
  name: string;
  kind: DocumentKind;
  language?: string;
  snippet: string;
}

export interface DirectorySearchResult {
  type: "directory";
  path: string;
  name: string;
  snippet: string;
}

export type SearchResult = FileSearchResult | DirectorySearchResult;

export interface SearchResponse {
  query: string;
  results: SearchResult[];
  indexedFiles: number;
  truncated: boolean;
}

export interface Heading {
  depth: number;
  text: string;
  id: string;
}
