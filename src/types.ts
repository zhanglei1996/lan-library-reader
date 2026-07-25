export type DocumentKind = "markdown" | "pdf" | "word" | "powerpoint";

export interface FileNode {
  type: "file";
  name: string;
  path: string;
  kind: DocumentKind;
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
  capabilities: {
    officePreview: boolean;
    officeProvider: string | null;
  };
}

export interface MarkdownDocument {
  name: string;
  path: string;
  content: string;
  modifiedAt: string;
}

export interface Heading {
  depth: number;
  text: string;
  id: string;
}
