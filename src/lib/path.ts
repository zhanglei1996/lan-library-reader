export function dirname(filePath: string): string {
  const parts = filePath.split("/");
  parts.pop();
  return parts.join("/");
}

export function resolveRelativePath(fromFile: string, target: string): string {
  const cleanTarget = target.split("#")[0].split("?")[0];
  const base = cleanTarget.startsWith("/")
    ? []
    : dirname(fromFile).split("/").filter(Boolean);
  const parts = [
    ...base,
    ...cleanTarget.replace(/^\/+/, "").split("/"),
  ];
  const resolved: string[] = [];

  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") resolved.pop();
    else resolved.push(part);
  }

  return resolved.join("/");
}

export function fileUrl(filePath: string): string {
  return `/api/file?path=${encodeURIComponent(filePath)}`;
}
