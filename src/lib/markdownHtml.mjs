const SAFE_ANCHOR_ID = /^[-A-Za-z0-9_:.]+$/;
const EMPTY_ANCHOR = /^<a\s+id=(['"])([^'"]+)\1\s*>\s*<\/a>$/i;

export function parseSafeHtmlAnchor(value) {
  const match = EMPTY_ANCHOR.exec(value.trim());
  if (!match) return null;
  const id = match[2];
  if (id.length > 256 || !SAFE_ANCHOR_ID.test(id)) return null;
  return id;
}
