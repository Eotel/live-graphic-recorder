import { resolve } from "node:path";
import {
  getMediaContentTypeFromPath,
  isPathWithinBaseDir,
} from "@/server/domain/media/path-policy";

export async function serveMediaFile(
  mediaBasePath: string,
  subdir: string,
  filePath: string,
): Promise<Response> {
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(filePath);
  } catch {
    return new Response("Bad Request", { status: 400 });
  }
  const fullPath = resolve(mediaBasePath, subdir, decodedPath);

  if (!isPathWithinBaseDir(mediaBasePath, fullPath)) {
    return new Response("Forbidden", { status: 403 });
  }

  const file = Bun.file(fullPath);
  if (!(await file.exists())) {
    return new Response("Not Found", { status: 404 });
  }

  return new Response(file, {
    headers: {
      "Content-Type": getMediaContentTypeFromPath(fullPath),
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
