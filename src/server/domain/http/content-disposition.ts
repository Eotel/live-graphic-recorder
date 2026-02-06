export function buildContentDispositionAttachment(filename: string): string {
  const fallback =
    filename
      .replace(/[^\x20-\x7E]+/g, "_")
      .replace(/["\\]/g, "_")
      .trim() || "meeting-report.zip";

  const encoded = encodeURIComponent(filename).replace(/\*/g, "%2A");
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
