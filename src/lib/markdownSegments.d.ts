import type { Heading } from "../types";

export interface MarkdownSegment {
  content: string;
  headings: Heading[];
}

export function createMarkdownSegments(markdown: string): MarkdownSegment[];
