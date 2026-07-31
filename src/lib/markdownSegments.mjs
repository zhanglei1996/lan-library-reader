import GithubSlugger from "github-slugger";

const LARGE_MARKDOWN_THRESHOLD = 64 * 1024;
const SEGMENT_TARGET_SIZE = 32 * 1024;
const REFERENCE_DEFINITION = /^\s{0,3}\[(?:\^[^\]]+|[^\]]+)\]:/m;
const textEncoder = new globalThis.TextEncoder();

function byteLength(value) {
  return textEncoder.encode(value).byteLength;
}

function headingText(value) {
  return value
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_`~]/g, "")
    .trim();
}

function extractHeadings(markdown) {
  const headings = [];
  const slugger = new GithubSlugger();
  let inFence = false;
  let mathBlock = false;
  let previousLine = "";

  for (const line of markdown.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      previousLine = "";
      continue;
    }
    if (inFence) {
      previousLine = "";
      continue;
    }
    if (/^\s*\$\$\s*$/.test(line)) {
      mathBlock = !mathBlock;
      previousLine = "";
      continue;
    }
    if (mathBlock) {
      previousLine = "";
      continue;
    }

    const atx = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    const setext = /^\s{0,3}(=+|-+)\s*$/.exec(line);
    const text = headingText(atx?.[2] ?? (setext ? previousLine : ""));
    if (text) {
      headings.push({
        depth: atx ? atx[1].length : setext?.[1][0] === "=" ? 1 : 2,
        text,
        id: slugger.slug(text),
      });
    }
    previousLine = line.trim() ? line.trim() : "";
  }

  return headings;
}

function splitAtSafeBoundaries(markdown) {
  const lines = markdown.match(/[^\n]*\n|[^\n]+$/g) ?? [markdown];
  const chunks = [];
  let chunk = "";
  let chunkBytes = 0;
  let fence;
  let mathBlock = false;

  for (const line of lines) {
    const lineBytes = byteLength(line);
    const fenceMatch = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      if (!fence) fence = marker;
      else if (fence === marker) fence = undefined;
    }
    if (!fence && /^\s*\$\$\s*$/.test(line)) mathBlock = !mathBlock;

    const isHeading = /^\s{0,3}#{1,6}\s+\S/.test(line);
    const canSplitBeforeHeading = !fence
      && !mathBlock
      && isHeading
      && chunkBytes >= SEGMENT_TARGET_SIZE / 2;
    if (canSplitBeforeHeading) {
      chunks.push(chunk);
      chunk = "";
      chunkBytes = 0;
    }

    chunk += line;
    chunkBytes += lineBytes;
    const canSplitAtParagraph = !fence
      && !mathBlock
      && /^\s*$/.test(line)
      && chunkBytes >= SEGMENT_TARGET_SIZE;
    if (canSplitAtParagraph) {
      chunks.push(chunk);
      chunk = "";
      chunkBytes = 0;
    }
  }

  if (chunk) chunks.push(chunk);
  return chunks.filter(Boolean);
}

export function createMarkdownSegments(markdown) {
  const allHeadings = extractHeadings(markdown);
  if (
    byteLength(markdown) < LARGE_MARKDOWN_THRESHOLD
    || REFERENCE_DEFINITION.test(markdown)
  ) {
    return [{ content: markdown, headings: allHeadings }];
  }

  const chunks = splitAtSafeBoundaries(markdown);
  if (chunks.length <= 1) return [{ content: markdown, headings: allHeadings }];

  let headingIndex = 0;
  return chunks.map((content) => {
    const count = extractHeadings(content).length;
    const headings = allHeadings.slice(headingIndex, headingIndex + count);
    headingIndex += count;
    return { content, headings };
  });
}
