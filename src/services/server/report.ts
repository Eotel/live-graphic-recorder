/**
 * Meeting report generator (Markdown + JSON + media bundle).
 *
 * Related: src/index.ts, src/services/server/persistence.ts
 */

import { extname, isAbsolute, relative, resolve } from "node:path";
import { strToU8, zipSync, Zip, ZipPassThrough } from "fflate";
import { DB_CONFIG } from "@/config/constants";

export class ReportSizeLimitError extends Error {
  public readonly maxBytes: number;
  public readonly totalBytes: number;

  constructor(message: string, input: { maxBytes: number; totalBytes: number }) {
    super(message);
    this.name = "ReportSizeLimitError";
    this.maxBytes = input.maxBytes;
    this.totalBytes = input.totalBytes;
  }
}

export interface PersistenceLike {
  getMeeting: (meetingId: string) => {
    id: string;
    title: string | null;
    startedAt: number;
    endedAt: number | null;
    createdAt: number;
  } | null;
  getSessionsByMeeting: (meetingId: string) => Array<{ id: string }>;
  loadMeetingTranscript: (meetingId: string) => Array<{
    text: string;
    timestamp: number;
    isFinal: boolean;
    speaker: number | null;
    startTime: number | null;
    isUtteranceEnd: boolean;
  }>;
  loadMeetingAnalyses: (meetingId: string) => Array<{
    summary: string[];
    topics: string[];
    tags: string[];
    flow: number;
    heat: number;
    timestamp: number;
  }>;
  loadMeetingImages: (meetingId: string) => Array<{
    id: number;
    filePath: string;
    prompt: string;
    timestamp: number;
  }>;
  loadMeetingCaptures: (meetingId: string) => Array<{
    id: number;
    filePath: string;
    timestamp: number;
  }>;
  loadMetaSummaries: (meetingId: string) => Array<{
    id: string;
    meetingId: string;
    startTime: number;
    endTime: number;
    summary: string[];
    themes: string[];
    representativeImageId: string | null;
    createdAt: number;
  }>;
  loadSpeakerAliases: (meetingId: string) => Array<{
    meetingId: string;
    speaker: number;
    displayName: string;
    updatedAt: number;
  }>;
}

export interface MeetingReportZipOptions {
  mediaBasePath?: string;
  maxMediaBytes?: number;
  includeMedia?: boolean;
  includeCaptures?: boolean;
  onMediaLimit?: "error" | "skip";
  now?: number;
}

export interface MeetingReportJson {
  meeting: {
    id: string;
    title: string | null;
    startedAt: number;
    endedAt: number | null;
    generatedAt: number;
    sessionCount: number;
  };
  transcript: {
    utterances: Array<{
      startTimestamp: number;
      endTimestamp: number;
      speaker?: number;
      startTime?: number;
      text: string;
    }>;
  };
  speakerAliases: Record<string, string>;
  summary: {
    latestAnalysis: {
      summary: string[];
      topics: string[];
      tags: string[];
      flow: number;
      heat: number;
      timestamp: number;
    } | null;
    analyses: Array<{
      summary: string[];
      topics: string[];
      tags: string[];
      flow: number;
      heat: number;
      timestamp: number;
    }>;
    metaSummaries: Array<{
      id: string;
      startTime: number;
      endTime: number;
      summary: string[];
      themes: string[];
      representativeImageId: string | null;
      createdAt: number;
    }>;
  };
  aggregates: {
    topics: Array<{ name: string; count: number }>;
    tags: Array<{ name: string; count: number }>;
  };
  media: {
    images: Array<{
      id: number;
      timestamp: number;
      prompt: string;
      file: string;
    }>;
    captures: Array<{
      id: number;
      timestamp: number;
      file: string;
    }>;
  };
  mediaBundle: {
    includeMedia: boolean;
    onMediaLimit: "error" | "skip";
    maxBytes: number;
    includedBytes: number;
    mode: "all" | "partial" | "none";
    counts: {
      total: { images: number; captures: number };
      included: { images: number; captures: number };
      omitted: { images: number; captures: number };
    };
  };
  missingMedia: Array<{
    kind: "image" | "capture";
    id: number;
    expectedPath: string;
    reason: "notFound" | "outsideBaseDir" | "sizeLimit" | "disabled";
    bytes?: number;
  }>;
}

interface MediaEntry {
  kind: "image" | "capture";
  id: number;
  sourcePath: string;
  zipPath: string;
}

const DEFAULT_MAX_MEDIA_BYTES = 2 * 1024 * 1024 * 1024; // 2GB

function sanitizeFilenameComponent(input: string): string {
  // Remove characters forbidden on common filesystems and collapse whitespace.
  return (
    input
      .replace(/[\\/:*?"<>|\u0000-\u001F]/g, "_")
      .replace(/\s+/g, " ")
      .trim()
      // Prevent extremely long filenames
      .slice(0, 80) || "untitled"
  );
}

function formatZipFilename(now: number, title: string | null): string {
  const d = new Date(now);
  const pad2 = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(
    d.getHours(),
  )}${pad2(d.getMinutes())}`;
  const safeTitle = sanitizeFilenameComponent(title ?? "Untitled Meeting");
  return `${stamp}-${safeTitle}-report.zip`;
}

function formatDateTimeJst(timestamp: number): string {
  const d = new Date(timestamp);
  if (!Number.isFinite(d.getTime())) {
    return String(timestamp);
  }
  try {
    return d.toLocaleString("ja-JP", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return d.toISOString();
  }
}

function isPathWithinBaseDir(baseDir: string, requestedPath: string): boolean {
  const base = resolve(baseDir);
  const resolvedPath = resolve(requestedPath);
  const rel = relative(base, resolvedPath);
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

function guessExt(filePath: string, fallback: string): string {
  const ext = extname(filePath).toLowerCase();
  if (ext === ".png" || ext === ".jpg" || ext === ".jpeg" || ext === ".webp") {
    return ext === ".jpeg" ? ".jpg" : ext;
  }
  return fallback;
}

function countByName(items: string[]): Array<{ name: string; count: number }> {
  const map = new Map<string, number>();
  for (const raw of items) {
    const name = raw.trim();
    if (!name) continue;
    map.set(name, (map.get(name) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function buildUtterances(
  finalSegments: Array<{
    text: string;
    timestamp: number;
    speaker: number | null;
    startTime: number | null;
    isUtteranceEnd: boolean;
  }>,
): MeetingReportJson["transcript"]["utterances"] {
  const utterances: MeetingReportJson["transcript"]["utterances"] = [];

  let buffer: typeof finalSegments = [];
  const flush = () => {
    if (buffer.length === 0) return;
    const first = buffer[0]!;
    const last = buffer[buffer.length - 1]!;
    const text = buffer
      .map((s) => s.text.trim())
      .filter(Boolean)
      .join(" ")
      .trim();
    if (!text) {
      buffer = [];
      return;
    }
    utterances.push({
      startTimestamp: first.timestamp,
      endTimestamp: last.timestamp,
      speaker: first.speaker ?? undefined,
      startTime: first.startTime ?? undefined,
      text,
    });
    buffer = [];
  };

  for (const seg of finalSegments) {
    buffer.push(seg);
    if (seg.isUtteranceEnd) {
      flush();
    }
  }
  flush();

  return utterances;
}

function resolveSpeakerLabel(
  speaker: number | undefined,
  speakerAliases: Record<string, string>,
): string {
  if (speaker === undefined) {
    return "Speaker ?";
  }
  const alias = speakerAliases[String(speaker)]?.trim();
  if (alias) {
    return alias;
  }
  return `Speaker ${speaker + 1}`;
}

function renderMediaReadme(report: MeetingReportJson): string {
  const lines: string[] = [];
  lines.push("# media について");
  lines.push("");
  lines.push("- `report.md` はこのZIP内の相対パス（例: `media/images/...`）を参照します。");
  lines.push(
    "- 一部のメディアが同梱されていない場合は `report.json` の `missingMedia` を参照してください。",
  );
  lines.push("");
  lines.push("## 同梱ポリシー");
  lines.push("");
  lines.push(`- includeMedia: ${report.mediaBundle.includeMedia}`);
  lines.push(`- onMediaLimit: ${report.mediaBundle.onMediaLimit}`);
  lines.push(`- maxBytes: ${report.mediaBundle.maxBytes}`);
  lines.push(`- includedBytes: ${report.mediaBundle.includedBytes}`);
  lines.push(`- mode: ${report.mediaBundle.mode}`);
  lines.push("");
  lines.push("## 同梱ファイル一覧");
  lines.push("");
  lines.push(`- images: ${report.media.images.length}`);
  if (report.media.captures.length > 0) {
    lines.push(`- captures: ${report.media.captures.length}`);
  }
  if (report.mediaBundle.mode !== "all") {
    lines.push("");
    lines.push("## 注意");
    lines.push("");
    lines.push(
      "- メディアが大きい/欠損している等の理由で、すべてのメディアが同梱されていない可能性があります。",
    );
  }
  return lines.join("\n");
}

function renderMarkdown(report: MeetingReportJson): string {
  const title = report.meeting.title?.trim() || "Untitled Meeting";
  const lines: string[] = [];
  const missingReason = (kind: "image" | "capture", id: number) =>
    report.missingMedia.find((m) => m.kind === kind && m.id === id)?.reason ?? null;
  const reasonLabel = (reason: MeetingReportJson["missingMedia"][number]["reason"]): string => {
    switch (reason) {
      case "disabled":
        return "設定により同梱しませんでした";
      case "sizeLimit":
        return "サイズ上限超過のため省略しました";
      case "outsideBaseDir":
        return "安全のため対象外（パス不正）";
      case "notFound":
        return "ファイルが存在しません";
    }
  };

  lines.push(`# ${title}`);
  lines.push("");
  lines.push(`- meetingId: \`${report.meeting.id}\``);
  lines.push(`- 生成日時: ${formatDateTimeJst(report.meeting.generatedAt)}`);
  lines.push(
    `- 開始: ${formatDateTimeJst(report.meeting.startedAt)} / 終了: ${
      report.meeting.endedAt ? formatDateTimeJst(report.meeting.endedAt) : "（未終了）"
    }`,
  );
  lines.push(`- session数: ${report.meeting.sessionCount}`);
  lines.push("");

  if (report.mediaBundle.mode !== "all") {
    lines.push("## メディア同梱について");
    lines.push("");
    if (!report.mediaBundle.includeMedia) {
      lines.push("- メディアは同梱されていません。");
    } else {
      lines.push(
        `- メディアはサイズ上限（${report.mediaBundle.maxBytes} bytes）により一部省略されている可能性があります。`,
      );
      lines.push(`- 同梱済み推定: ${report.mediaBundle.includedBytes} bytes`);
    }
    lines.push("");
  }

  // Highlights
  lines.push("## ハイライト");
  lines.push("");
  const meta = report.summary.metaSummaries.at(-1);
  if (meta && meta.summary.length > 0) {
    for (const p of meta.summary) lines.push(`- ${p}`);
    if (meta.themes.length > 0) {
      lines.push("");
      lines.push(`テーマ: ${meta.themes.join(", ")}`);
    }
  } else if (report.summary.latestAnalysis && report.summary.latestAnalysis.summary.length > 0) {
    for (const p of report.summary.latestAnalysis.summary) lines.push(`- ${p}`);
  } else {
    lines.push("- （まだサマリーがありません）");
  }
  lines.push("");

  // Aggregates
  lines.push("## トピック / タグ（集計）");
  lines.push("");
  const topTopics = report.aggregates.topics.slice(0, 10);
  const topTags = report.aggregates.tags.slice(0, 10);
  lines.push("### トピック");
  if (topTopics.length === 0) {
    lines.push("- （なし）");
  } else {
    for (const t of topTopics) lines.push(`- ${t.name} (${t.count})`);
  }
  lines.push("");
  lines.push("### タグ");
  if (topTags.length === 0) {
    lines.push("- （なし）");
  } else {
    for (const t of topTags) lines.push(`- ${t.name} (${t.count})`);
  }
  lines.push("");

  // Summary timeline
  lines.push("## サマリー（タイムライン）");
  lines.push("");
  if (report.summary.analyses.length === 0) {
    lines.push("- （なし）");
  } else {
    for (const a of report.summary.analyses) {
      lines.push(`### ${formatDateTimeJst(a.timestamp)}`);
      for (const p of a.summary) lines.push(`- ${p}`);
      if (a.topics.length > 0) lines.push(`- topics: ${a.topics.join(", ")}`);
      if (a.tags.length > 0) lines.push(`- tags: ${a.tags.join(", ")}`);
      lines.push(`- flow: ${a.flow} / heat: ${a.heat}`);
      lines.push("");
    }
  }
  lines.push("");

  // Transcript
  lines.push("## 文字起こし（発話単位）");
  lines.push("");
  if (report.transcript.utterances.length === 0) {
    lines.push("- （なし）");
  } else {
    for (const u of report.transcript.utterances) {
      const who = resolveSpeakerLabel(u.speaker, report.speakerAliases);
      lines.push(`- **${who}** (${formatDateTimeJst(u.startTimestamp)}): ${u.text}`);
    }
  }
  lines.push("");

  // Images
  lines.push("## 生成画像");
  lines.push("");
  if (report.media.images.length === 0) {
    lines.push("- （なし）");
  } else {
    for (const img of report.media.images) {
      lines.push(`### ${formatDateTimeJst(img.timestamp)} / id=${img.id}`);
      lines.push("");
      lines.push(`- prompt: ${img.prompt}`);
      const reason = missingReason("image", img.id);
      if (reason) {
        lines.push(`- （同梱なし: ${reasonLabel(reason)}）`);
        lines.push("");
        continue;
      }
      lines.push("");
      lines.push(`![](${img.file})`);
      lines.push("");
    }
  }
  lines.push("");

  // Captures
  if (report.media.captures.length > 0) {
    lines.push("## キャプチャ");
    lines.push("");
    for (const cap of report.media.captures) {
      lines.push(`### ${formatDateTimeJst(cap.timestamp)} / id=${cap.id}`);
      lines.push("");
      const reason = missingReason("capture", cap.id);
      if (reason) {
        lines.push(`- （同梱なし: ${reasonLabel(reason)}）`);
        lines.push("");
        continue;
      }
      lines.push(`![](${cap.file})`);
      lines.push("");
    }
    lines.push("");
  }

  if (report.missingMedia.length > 0) {
    lines.push("## 欠損メディア");
    lines.push("");
    for (const m of report.missingMedia) {
      lines.push(`- ${m.kind} id=${m.id}: ${m.expectedPath} (${reasonLabel(m.reason)})`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

export async function buildMeetingReportZip(
  persistence: PersistenceLike,
  meetingId: string,
  options: MeetingReportZipOptions = {},
): Promise<{ bytes: Uint8Array; filename: string; mediaBundle: MeetingReportJson["mediaBundle"] }> {
  const prepared = await prepareMeetingReportZip(persistence, meetingId, options);
  const zipFiles: Record<string, Uint8Array> = {
    "report.md": strToU8(prepared.reportMd),
    "report.json": strToU8(prepared.reportJsonStr),
    "media/README.md": strToU8(prepared.mediaReadme),
  };

  for (const entry of prepared.includedEntries) {
    const file = Bun.file(entry.sourcePath);
    // eslint-disable-next-line no-await-in-loop
    const exists = await file.exists();
    if (!exists) {
      continue;
    }
    // eslint-disable-next-line no-await-in-loop
    const buf = await file.arrayBuffer();
    zipFiles[entry.zipPath] = new Uint8Array(buf);
  }

  const bytes = zipSync(zipFiles, { level: 6 });
  return { bytes, filename: prepared.filename, mediaBundle: prepared.mediaBundle };
}

export async function buildMeetingReportZipStream(
  persistence: PersistenceLike,
  meetingId: string,
  options: MeetingReportZipOptions = {},
): Promise<{
  stream: ReadableStream<Uint8Array>;
  filename: string;
  mediaBundle: MeetingReportJson["mediaBundle"];
}> {
  const prepared = await prepareMeetingReportZip(persistence, meetingId, options);

  let zip: Zip | null = null;
  let aborted = false;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      zip = new Zip((err, data, final) => {
        if (aborted) return;
        if (err) {
          controller.error(err);
          return;
        }
        if (data && data.length > 0) controller.enqueue(data);
        if (final) controller.close();
      });

      const addTextFile = (path: string, text: string) => {
        const file = new ZipPassThrough(path);
        zip!.add(file);
        file.push(strToU8(text), true);
      };

      addTextFile("report.md", prepared.reportMd);
      addTextFile("report.json", prepared.reportJsonStr);
      addTextFile("media/README.md", prepared.mediaReadme);

      const run = async () => {
        for (const entry of prepared.includedEntries) {
          if (aborted) return;
          const out = new ZipPassThrough(entry.zipPath);
          zip!.add(out);

          const file = Bun.file(entry.sourcePath);
          // eslint-disable-next-line no-await-in-loop
          const exists = await file.exists();
          if (!exists) {
            out.push(new Uint8Array(), true);
            continue;
          }

          const reader = file.stream().getReader();
          while (true) {
            // eslint-disable-next-line no-await-in-loop
            const { value, done } = await reader.read();
            if (done) break;
            if (!value) continue;
            out.push(value, false);
          }
          out.push(new Uint8Array(), true);
        }

        zip!.end();
      };

      run().catch((error) => {
        if (aborted) return;
        controller.error(error);
      });
    },
    cancel() {
      aborted = true;
      zip?.terminate();
      zip = null;
    },
  });

  return { stream, filename: prepared.filename, mediaBundle: prepared.mediaBundle };
}

async function prepareMeetingReportZip(
  persistence: PersistenceLike,
  meetingId: string,
  options: MeetingReportZipOptions,
): Promise<{
  filename: string;
  reportMd: string;
  reportJsonStr: string;
  mediaReadme: string;
  includedEntries: MediaEntry[];
  mediaBundle: MeetingReportJson["mediaBundle"];
}> {
  const now = options.now ?? Date.now();
  const mediaBasePath = options.mediaBasePath ?? DB_CONFIG.defaultMediaPath;
  const maxMediaBytes = options.maxMediaBytes ?? DEFAULT_MAX_MEDIA_BYTES;
  const includeMedia = options.includeMedia ?? true;
  const includeCaptures = options.includeCaptures ?? false;
  const onMediaLimit = options.onMediaLimit ?? "error";

  const meeting = persistence.getMeeting(meetingId);
  if (!meeting) {
    throw new Error("Meeting not found");
  }

  const sessions = persistence.getSessionsByMeeting(meetingId);
  const transcript = persistence
    .loadMeetingTranscript(meetingId)
    .filter((s) => s.isFinal)
    .map((s) => ({
      text: s.text,
      timestamp: s.timestamp,
      speaker: s.speaker,
      startTime: s.startTime,
      isUtteranceEnd: s.isUtteranceEnd,
    }));
  const utterances = buildUtterances(transcript);

  const analyses = persistence.loadMeetingAnalyses(meetingId);
  const latestAnalysis = analyses.at(-1) ?? null;

  const allTopics = analyses.flatMap((a) => a.topics);
  const allTags = analyses.flatMap((a) => a.tags);
  const aggregates = {
    topics: countByName(allTopics),
    tags: countByName(allTags),
  };

  const images = persistence.loadMeetingImages(meetingId);
  const captures = includeCaptures ? persistence.loadMeetingCaptures(meetingId) : [];
  const metaSummaries = persistence.loadMetaSummaries(meetingId);
  const speakerAliases = persistence.loadSpeakerAliases(meetingId);
  const speakerAliasMap: Record<string, string> = {};
  for (const alias of speakerAliases) {
    if (!Number.isInteger(alias.speaker) || alias.speaker < 0) continue;
    const displayName = alias.displayName.trim();
    if (!displayName) continue;
    speakerAliasMap[String(alias.speaker)] = displayName;
  }

  const mediaEntries: MediaEntry[] = [];
  const reportMissing: MeetingReportJson["missingMedia"] = [];
  const includedEntries: MediaEntry[] = [];

  const reportImages: MeetingReportJson["media"]["images"] = images.map((img) => {
    const ext = guessExt(img.filePath, ".png");
    const zipPath = `media/images/${img.id}${ext}`;
    mediaEntries.push({ kind: "image", id: img.id, sourcePath: img.filePath, zipPath });
    return { id: img.id, timestamp: img.timestamp, prompt: img.prompt, file: zipPath };
  });

  const reportCaptures: MeetingReportJson["media"]["captures"] = captures.map((cap) => {
    const ext = guessExt(cap.filePath, ".jpg");
    const zipPath = `media/captures/${cap.id}${ext}`;
    mediaEntries.push({ kind: "capture", id: cap.id, sourcePath: cap.filePath, zipPath });
    return { id: cap.id, timestamp: cap.timestamp, file: zipPath };
  });

  // Pre-flight size check + missing detection
  let includedBytes = 0;
  for (const entry of mediaEntries) {
    if (!includeMedia) {
      reportMissing.push({
        kind: entry.kind,
        id: entry.id,
        expectedPath: entry.zipPath,
        reason: "disabled",
      });
      continue;
    }
    if (!isPathWithinBaseDir(mediaBasePath, entry.sourcePath)) {
      reportMissing.push({
        kind: entry.kind,
        id: entry.id,
        expectedPath: entry.zipPath,
        reason: "outsideBaseDir",
      });
      continue;
    }
    const file = Bun.file(entry.sourcePath);
    // eslint-disable-next-line no-await-in-loop
    const exists = await file.exists();
    if (!exists) {
      reportMissing.push({
        kind: entry.kind,
        id: entry.id,
        expectedPath: entry.zipPath,
        reason: "notFound",
      });
      continue;
    }
    const nextTotal = includedBytes + file.size;
    if (nextTotal > maxMediaBytes) {
      if (onMediaLimit === "error") {
        throw new ReportSizeLimitError("Media bundle exceeds size limit", {
          maxBytes: maxMediaBytes,
          totalBytes: nextTotal,
        });
      }
      reportMissing.push({
        kind: entry.kind,
        id: entry.id,
        expectedPath: entry.zipPath,
        reason: "sizeLimit",
        bytes: file.size,
      });
      continue;
    }
    includedBytes = nextTotal;
    includedEntries.push(entry);
  }

  const countKind = (items: MediaEntry[], kind: MediaEntry["kind"]) =>
    items.reduce((acc, e) => (e.kind === kind ? acc + 1 : acc), 0);
  const totalCounts = { images: reportImages.length, captures: reportCaptures.length };
  const includedCounts = {
    images: countKind(includedEntries, "image"),
    captures: countKind(includedEntries, "capture"),
  };
  const omittedCounts = {
    images: Math.max(0, totalCounts.images - includedCounts.images),
    captures: Math.max(0, totalCounts.captures - includedCounts.captures),
  };
  const totalMediaCount = totalCounts.images + totalCounts.captures;
  const includedMediaCount = includedCounts.images + includedCounts.captures;
  const mode: MeetingReportJson["mediaBundle"]["mode"] =
    totalMediaCount === 0
      ? "all"
      : includedMediaCount === 0
        ? "none"
        : includedMediaCount === totalMediaCount
          ? "all"
          : "partial";

  const mediaBundle: MeetingReportJson["mediaBundle"] = {
    includeMedia,
    onMediaLimit,
    maxBytes: maxMediaBytes,
    includedBytes,
    mode,
    counts: { total: totalCounts, included: includedCounts, omitted: omittedCounts },
  };

  const reportJson: MeetingReportJson = {
    meeting: {
      id: meeting.id,
      title: meeting.title,
      startedAt: meeting.startedAt,
      endedAt: meeting.endedAt,
      generatedAt: now,
      sessionCount: sessions.length,
    },
    transcript: { utterances },
    speakerAliases: speakerAliasMap,
    summary: {
      latestAnalysis: latestAnalysis
        ? {
            summary: latestAnalysis.summary,
            topics: latestAnalysis.topics,
            tags: latestAnalysis.tags,
            flow: latestAnalysis.flow,
            heat: latestAnalysis.heat,
            timestamp: latestAnalysis.timestamp,
          }
        : null,
      analyses: analyses.map((a) => ({
        summary: a.summary,
        topics: a.topics,
        tags: a.tags,
        flow: a.flow,
        heat: a.heat,
        timestamp: a.timestamp,
      })),
      metaSummaries: metaSummaries.map((ms) => ({
        id: ms.id,
        startTime: ms.startTime,
        endTime: ms.endTime,
        summary: ms.summary,
        themes: ms.themes,
        representativeImageId: ms.representativeImageId,
        createdAt: ms.createdAt,
      })),
    },
    aggregates,
    media: {
      images: reportImages,
      captures: reportCaptures,
    },
    mediaBundle,
    missingMedia: reportMissing,
  };

  const reportMd = renderMarkdown(reportJson);
  const reportJsonStr = JSON.stringify(reportJson, null, 2);
  const mediaReadme = renderMediaReadme(reportJson);

  const filename = formatZipFilename(now, meeting.title);
  return { filename, reportMd, reportJsonStr, mediaReadme, includedEntries, mediaBundle };
}
