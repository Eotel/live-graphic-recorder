import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { strFromU8, unzipSync } from "fflate";
import {
  buildMeetingReportZip,
  buildMeetingReportZipStream,
  ReportSizeLimitError,
  type PersistenceLike,
} from "./report";

function makeTempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

describe("buildMeetingReportZip", () => {
  test("creates zip with report.md/report.json and bundled media", async () => {
    const base = makeTempDir("lgr-report-");
    const mediaBasePath = join(base, "media");
    const meetingId = "00000000-0000-4000-8000-000000000000";

    const imagePath = join(mediaBasePath, "images", "session-1", "img-1.png");
    const capturePath = join(mediaBasePath, "captures", "session-1", "cap-1.jpg");

    mkdirSync(join(mediaBasePath, "images", "session-1"), { recursive: true });
    mkdirSync(join(mediaBasePath, "captures", "session-1"), { recursive: true });

    await Bun.write(imagePath, new Uint8Array([1, 2, 3, 4]));
    await Bun.write(capturePath, new Uint8Array([9, 8, 7]));

    const persistence: PersistenceLike = {
      getMeeting: (id) =>
        id === meetingId
          ? {
              id: meetingId,
              title: "テスト会議",
              startedAt: 1700000000000,
              endedAt: 1700000100000,
              createdAt: 1700000000000,
            }
          : null,
      getSessionsByMeeting: () => [{ id: "session-1" }, { id: "session-2" }],
      loadMeetingTranscript: () => [
        {
          text: "こんにちは",
          timestamp: 1700000001000,
          isFinal: true,
          speaker: 1,
          startTime: 0.1,
          isUtteranceEnd: false,
        },
        {
          text: "世界",
          timestamp: 1700000002000,
          isFinal: true,
          speaker: 1,
          startTime: 0.2,
          isUtteranceEnd: true,
        },
      ],
      loadMeetingAnalyses: () => [
        {
          summary: ["要点A", "要点B"],
          topics: ["AI", "AI", "音声"],
          tags: ["tag1", "tag2"],
          flow: 60,
          heat: 40,
          timestamp: 1700000003000,
        },
      ],
      loadMeetingImages: () => [
        {
          id: 1,
          filePath: imagePath,
          prompt: "prompt-1",
          timestamp: 1700000004000,
        },
      ],
      loadMeetingCaptures: () => [
        {
          id: 2,
          filePath: capturePath,
          timestamp: 1700000005000,
        },
      ],
      loadMetaSummaries: () => [],
    };

    try {
      const { bytes, filename, mediaBundle } = await buildMeetingReportZip(persistence, meetingId, {
        mediaBasePath,
        now: 1700000200000,
      });

      expect(filename.endsWith("-report.zip")).toBe(true);
      expect(mediaBundle.mode).toBe("all");

      const files = unzipSync(bytes);
      expect(files["report.md"]).toBeDefined();
      expect(files["report.json"]).toBeDefined();
      expect(files["media/README.md"]).toBeDefined();

      const reportJson = JSON.parse(strFromU8(files["report.json"]!)) as any;
      expect(reportJson.meeting.id).toBe(meetingId);
      expect(reportJson.meeting.sessionCount).toBe(2);
      expect(reportJson.transcript.utterances.length).toBe(1);
      expect(reportJson.transcript.utterances[0].text).toBe("こんにちは 世界");
      expect(reportJson.aggregates.topics[0]).toEqual({ name: "AI", count: 2 });

      expect(files["media/images/1.png"]).toBeDefined();
      expect(files["media/captures/2.jpg"]).toBeUndefined();
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  test("throws ReportSizeLimitError when media is too large", async () => {
    const base = makeTempDir("lgr-report-large-");
    const mediaBasePath = join(base, "media");
    const meetingId = "00000000-0000-4000-8000-000000000001";

    const imagePath = join(mediaBasePath, "images", "session-1", "big.png");
    mkdirSync(join(mediaBasePath, "images", "session-1"), { recursive: true });
    await Bun.write(imagePath, new Uint8Array(10));

    const persistence: PersistenceLike = {
      getMeeting: () => ({
        id: meetingId,
        title: "Big",
        startedAt: 1,
        endedAt: null,
        createdAt: 1,
      }),
      getSessionsByMeeting: () => [{ id: "session-1" }],
      loadMeetingTranscript: () => [],
      loadMeetingAnalyses: () => [],
      loadMeetingImages: () => [{ id: 1, filePath: imagePath, prompt: "p", timestamp: 1 }],
      loadMeetingCaptures: () => [],
      loadMetaSummaries: () => [],
    };

    try {
      await expect(
        buildMeetingReportZip(persistence, meetingId, {
          mediaBasePath,
          maxMediaBytes: 1,
          now: 2,
        }),
      ).rejects.toBeInstanceOf(ReportSizeLimitError);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  test("skips media when onMediaLimit is skip", async () => {
    const base = makeTempDir("lgr-report-skip-");
    const mediaBasePath = join(base, "media");
    const meetingId = "00000000-0000-4000-8000-000000000002";

    const imagePath = join(mediaBasePath, "images", "session-1", "big.png");
    mkdirSync(join(mediaBasePath, "images", "session-1"), { recursive: true });
    await Bun.write(imagePath, new Uint8Array([1, 2, 3, 4]));

    const persistence: PersistenceLike = {
      getMeeting: () => ({
        id: meetingId,
        title: "Skip",
        startedAt: 1,
        endedAt: null,
        createdAt: 1,
      }),
      getSessionsByMeeting: () => [{ id: "session-1" }],
      loadMeetingTranscript: () => [],
      loadMeetingAnalyses: () => [],
      loadMeetingImages: () => [{ id: 1, filePath: imagePath, prompt: "p", timestamp: 1 }],
      loadMeetingCaptures: () => [],
      loadMetaSummaries: () => [],
    };

    try {
      const { bytes, mediaBundle } = await buildMeetingReportZip(persistence, meetingId, {
        mediaBasePath,
        maxMediaBytes: 1,
        onMediaLimit: "skip",
        now: 2,
      });

      expect(mediaBundle.mode).toBe("none");

      const files = unzipSync(bytes);
      const reportJson = JSON.parse(strFromU8(files["report.json"]!)) as any;
      expect(Array.isArray(reportJson.missingMedia)).toBe(true);
      expect(reportJson.missingMedia[0]).toMatchObject({
        kind: "image",
        id: 1,
        reason: "sizeLimit",
      });
      expect(files["media/images/1.png"]).toBeUndefined();
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  test("includes captures when includeCaptures is true", async () => {
    const base = makeTempDir("lgr-report-captures-");
    const mediaBasePath = join(base, "media");
    const meetingId = "00000000-0000-4000-8000-000000000004";

    const capturePath = join(mediaBasePath, "captures", "session-1", "cap-1.jpg");
    mkdirSync(join(mediaBasePath, "captures", "session-1"), { recursive: true });
    await Bun.write(capturePath, new Uint8Array([9, 8, 7]));

    const persistence: PersistenceLike = {
      getMeeting: () => ({
        id: meetingId,
        title: "Caps",
        startedAt: 1,
        endedAt: null,
        createdAt: 1,
      }),
      getSessionsByMeeting: () => [{ id: "session-1" }],
      loadMeetingTranscript: () => [],
      loadMeetingAnalyses: () => [],
      loadMeetingImages: () => [],
      loadMeetingCaptures: () => [{ id: 2, filePath: capturePath, timestamp: 1 }],
      loadMetaSummaries: () => [],
    };

    try {
      const { bytes } = await buildMeetingReportZip(persistence, meetingId, {
        mediaBasePath,
        includeCaptures: true,
        now: 2,
      });

      const files = unzipSync(bytes);
      expect(files["media/captures/2.jpg"]).toBeDefined();
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  test("creates zip as stream", async () => {
    const base = makeTempDir("lgr-report-stream-");
    const mediaBasePath = join(base, "media");
    const meetingId = "00000000-0000-4000-8000-000000000003";

    const imagePath = join(mediaBasePath, "images", "session-1", "img-1.png");
    mkdirSync(join(mediaBasePath, "images", "session-1"), { recursive: true });
    await Bun.write(imagePath, new Uint8Array([1, 2, 3, 4]));

    const persistence: PersistenceLike = {
      getMeeting: () => ({
        id: meetingId,
        title: "Stream",
        startedAt: 1,
        endedAt: null,
        createdAt: 1,
      }),
      getSessionsByMeeting: () => [{ id: "session-1" }],
      loadMeetingTranscript: () => [],
      loadMeetingAnalyses: () => [],
      loadMeetingImages: () => [{ id: 1, filePath: imagePath, prompt: "p", timestamp: 1 }],
      loadMeetingCaptures: () => [],
      loadMetaSummaries: () => [],
    };

    const readAll = async (stream: ReadableStream<Uint8Array>) => {
      const reader = stream.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      while (true) {
        // eslint-disable-next-line no-await-in-loop
        const { value, done } = await reader.read();
        if (done) break;
        if (!value) continue;
        chunks.push(value);
        total += value.length;
      }
      const out = new Uint8Array(total);
      let offset = 0;
      for (const c of chunks) {
        out.set(c, offset);
        offset += c.length;
      }
      return out;
    };

    try {
      const { stream } = await buildMeetingReportZipStream(persistence, meetingId, {
        mediaBasePath,
        now: 2,
      });

      const bytes = await readAll(stream);
      const files = unzipSync(bytes);
      expect(files["report.json"]).toBeDefined();
      expect(files["media/images/1.png"]).toBeDefined();
      expect(files["media/captures/2.jpg"]).toBeUndefined();
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });
});
