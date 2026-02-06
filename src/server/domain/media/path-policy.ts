import { isAbsolute, relative, resolve } from "node:path";

export function isPathWithinBaseDir(basePath: string, requestedPath: string): boolean {
  const resolvedPath = resolve(requestedPath);
  const rel = relative(basePath, resolvedPath);
  if (
    rel === "" ||
    rel === ".." ||
    rel.startsWith("../") ||
    rel.startsWith("..\\") ||
    isAbsolute(rel)
  ) {
    return false;
  }
  return true;
}

export function getMediaContentTypeFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  return ext === "png"
    ? "image/png"
    : ext === "jpg" || ext === "jpeg"
      ? "image/jpeg"
      : ext === "webm"
        ? "audio/webm"
        : "application/octet-stream";
}
