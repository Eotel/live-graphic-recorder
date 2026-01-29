/**
 * Meta-summary service tests.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/services/server/meta-summary.ts, src/services/server/persistence.ts
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { PersistenceService } from "./persistence";
import {
  shouldTriggerMetaSummary,
  prepareMetaSummaryInput,
  generateAndPersistMetaSummary,
  type MetaSummaryGenerationResult,
} from "./meta-summary";
import { existsSync, rmSync } from "node:fs";
import { META_SUMMARY_INTERVAL_MS, META_SUMMARY_SESSION_THRESHOLD } from "@/config/constants";

describe("shouldTriggerMetaSummary", () => {
  const testDbPath = ":memory:";
  const testMediaPath = "/tmp/test-meta-summary-media";
  let persistence: PersistenceService;
  let meetingId: string;

  beforeEach(() => {
    if (existsSync(testMediaPath)) {
      rmSync(testMediaPath, { recursive: true });
    }
    persistence = new PersistenceService(testDbPath, testMediaPath);
    const meeting = persistence.createMeeting("Test Meeting");
    meetingId = meeting.id;
  });

  afterEach(() => {
    persistence.close();
    if (existsSync(testMediaPath)) {
      rmSync(testMediaPath, { recursive: true });
    }
  });

  test("returns false when no analyses exist", () => {
    const result = shouldTriggerMetaSummary(persistence, meetingId);

    expect(result).toBe(false);
  });

  test("returns false when fewer than threshold analyses exist", async () => {
    persistence.createSession(meetingId, "session-1");

    // Add 5 analyses (threshold is 6)
    for (let i = 1; i <= 5; i++) {
      await persistence.persistAnalysisWithTimestamp(
        "session-1",
        {
          summary: [`Summary ${i}`],
          topics: [],
          tags: [],
          flow: 50,
          heat: 50,
          imagePrompt: `Prompt ${i}`,
        },
        i * 100,
      );
    }

    const result = shouldTriggerMetaSummary(persistence, meetingId);

    expect(result).toBe(false);
  });

  test("returns true when threshold analyses exist and no meta-summary yet", async () => {
    persistence.createSession(meetingId, "session-1");

    // Add 6 analyses (threshold)
    for (let i = 1; i <= 6; i++) {
      await persistence.persistAnalysisWithTimestamp(
        "session-1",
        {
          summary: [`Summary ${i}`],
          topics: [],
          tags: [],
          flow: 50,
          heat: 50,
          imagePrompt: `Prompt ${i}`,
        },
        i * 100,
      );
    }

    const result = shouldTriggerMetaSummary(persistence, meetingId);

    expect(result).toBe(true);
  });

  test("returns false when recent meta-summary exists within interval", async () => {
    persistence.createSession(meetingId, "session-1");

    // Add 10 analyses
    const now = Date.now();
    for (let i = 1; i <= 10; i++) {
      await persistence.persistAnalysisWithTimestamp(
        "session-1",
        {
          summary: [`Summary ${i}`],
          topics: [],
          tags: [],
          flow: 50,
          heat: 50,
          imagePrompt: `Prompt ${i}`,
        },
        now - 60000 + i * 1000, // Within the last minute
      );
    }

    // Create a recent meta-summary
    persistence.persistMetaSummary(meetingId, {
      startTime: now - 60000,
      endTime: now - 30000, // 30 seconds ago
      summary: ["Meta summary"],
      themes: [],
      representativeImageId: null,
    });

    const result = shouldTriggerMetaSummary(persistence, meetingId);

    expect(result).toBe(false);
  });

  test("returns true when meta-summary exists but interval has passed with enough new analyses", async () => {
    persistence.createSession(meetingId, "session-1");

    const now = Date.now();
    const oldTime = now - META_SUMMARY_INTERVAL_MS - 1000; // Just over interval

    // Create an old meta-summary
    persistence.persistMetaSummary(meetingId, {
      startTime: oldTime - 30 * 60 * 1000,
      endTime: oldTime,
      summary: ["Old meta summary"],
      themes: [],
      representativeImageId: null,
    });

    // Add 6 new analyses after the meta-summary
    for (let i = 1; i <= 6; i++) {
      await persistence.persistAnalysisWithTimestamp(
        "session-1",
        {
          summary: [`New summary ${i}`],
          topics: [],
          tags: [],
          flow: 50,
          heat: 50,
          imagePrompt: `Prompt ${i}`,
        },
        oldTime + i * 1000, // After the old meta-summary
      );
    }

    const result = shouldTriggerMetaSummary(persistence, meetingId);

    expect(result).toBe(true);
  });
});

describe("prepareMetaSummaryInput", () => {
  const testDbPath = ":memory:";
  const testMediaPath = "/tmp/test-meta-summary-input-media";
  let persistence: PersistenceService;
  let meetingId: string;

  beforeEach(() => {
    if (existsSync(testMediaPath)) {
      rmSync(testMediaPath, { recursive: true });
    }
    persistence = new PersistenceService(testDbPath, testMediaPath);
    const meeting = persistence.createMeeting("Test Meeting");
    meetingId = meeting.id;
    persistence.createSession(meetingId, "session-1");
  });

  afterEach(() => {
    persistence.close();
    if (existsSync(testMediaPath)) {
      rmSync(testMediaPath, { recursive: true });
    }
  });

  test("returns null when no analyses exist", () => {
    const result = prepareMetaSummaryInput(persistence, meetingId);

    expect(result).toBeNull();
  });

  test("returns analyses since last meta-summary", async () => {
    const now = Date.now();

    // Create a meta-summary
    persistence.persistMetaSummary(meetingId, {
      startTime: now - 60000,
      endTime: now - 30000,
      summary: ["Old summary"],
      themes: [],
      representativeImageId: null,
    });

    // Add analyses before meta-summary (should not be included)
    await persistence.persistAnalysisWithTimestamp(
      "session-1",
      {
        summary: ["Before meta"],
        topics: ["Old topic"],
        tags: [],
        flow: 50,
        heat: 50,
        imagePrompt: "Old prompt",
      },
      now - 40000,
    );

    // Add analyses after meta-summary (should be included)
    await persistence.persistAnalysisWithTimestamp(
      "session-1",
      {
        summary: ["After meta 1"],
        topics: ["New topic 1"],
        tags: [],
        flow: 60,
        heat: 70,
        imagePrompt: "New prompt 1",
      },
      now - 20000,
    );
    await persistence.persistAnalysisWithTimestamp(
      "session-1",
      {
        summary: ["After meta 2"],
        topics: ["New topic 2"],
        tags: [],
        flow: 70,
        heat: 80,
        imagePrompt: "New prompt 2",
      },
      now - 10000,
    );

    const result = prepareMetaSummaryInput(persistence, meetingId);

    expect(result).not.toBeNull();
    expect(result!.analyses).toHaveLength(2);
    expect(result!.analyses[0]!.summary).toEqual(["After meta 1"]);
    expect(result!.analyses[1]!.summary).toEqual(["After meta 2"]);
  });

  test("returns all analyses when no meta-summary exists", async () => {
    const now = Date.now();

    // Add analyses
    await persistence.persistAnalysisWithTimestamp(
      "session-1",
      {
        summary: ["First"],
        topics: ["Topic 1"],
        tags: [],
        flow: 50,
        heat: 50,
        imagePrompt: "Prompt 1",
      },
      now - 20000,
    );
    await persistence.persistAnalysisWithTimestamp(
      "session-1",
      {
        summary: ["Second"],
        topics: ["Topic 2"],
        tags: [],
        flow: 60,
        heat: 60,
        imagePrompt: "Prompt 2",
      },
      now - 10000,
    );

    const result = prepareMetaSummaryInput(persistence, meetingId);

    expect(result).not.toBeNull();
    expect(result!.analyses).toHaveLength(2);
    expect(result!.startTime).toBeLessThan(result!.endTime);
  });

  test("includes start and end time from analyses", async () => {
    const startTime = 1000;
    const endTime = 3000;

    await persistence.persistAnalysisWithTimestamp(
      "session-1",
      {
        summary: ["First"],
        topics: [],
        tags: [],
        flow: 50,
        heat: 50,
        imagePrompt: "Prompt 1",
      },
      startTime,
    );
    await persistence.persistAnalysisWithTimestamp(
      "session-1",
      {
        summary: ["Last"],
        topics: [],
        tags: [],
        flow: 60,
        heat: 60,
        imagePrompt: "Prompt 2",
      },
      endTime,
    );

    const result = prepareMetaSummaryInput(persistence, meetingId);

    expect(result).not.toBeNull();
    expect(result!.startTime).toBe(startTime);
    expect(result!.endTime).toBe(endTime);
  });
});

describe("generateAndPersistMetaSummary", () => {
  const testDbPath = ":memory:";
  const testMediaPath = "/tmp/test-meta-summary-gen-media";
  let persistence: PersistenceService;
  let meetingId: string;

  beforeEach(() => {
    if (existsSync(testMediaPath)) {
      rmSync(testMediaPath, { recursive: true });
    }
    persistence = new PersistenceService(testDbPath, testMediaPath);
    const meeting = persistence.createMeeting("Test Meeting");
    meetingId = meeting.id;
    persistence.createSession(meetingId, "session-1");
  });

  afterEach(() => {
    persistence.close();
    if (existsSync(testMediaPath)) {
      rmSync(testMediaPath, { recursive: true });
    }
  });

  test("generates meta-summary from analyses", async () => {
    // Add analyses
    for (let i = 1; i <= 6; i++) {
      await persistence.persistAnalysisWithTimestamp(
        "session-1",
        {
          summary: [`Summary point ${i}`],
          topics: [`Topic ${i}`],
          tags: [],
          flow: 50,
          heat: 50,
          imagePrompt: `Prompt ${i}`,
        },
        i * 1000,
      );
    }

    // Mock summarizer function
    const mockSummarizer = async (): Promise<MetaSummaryGenerationResult> => ({
      summary: ["Consolidated summary 1", "Consolidated summary 2"],
      themes: ["Main theme", "Secondary theme"],
    });

    const result = await generateAndPersistMetaSummary(persistence, meetingId, mockSummarizer);

    expect(result).not.toBeNull();
    expect(result!.summary).toEqual(["Consolidated summary 1", "Consolidated summary 2"]);
    expect(result!.themes).toEqual(["Main theme", "Secondary theme"]);

    // Verify it was persisted
    const metaSummaries = persistence.loadMetaSummaries(meetingId);
    expect(metaSummaries).toHaveLength(1);
    expect(metaSummaries[0]!.summary).toEqual(["Consolidated summary 1", "Consolidated summary 2"]);
  });

  test("returns null when no analyses to summarize", async () => {
    const mockSummarizer = async (): Promise<MetaSummaryGenerationResult> => ({
      summary: [],
      themes: [],
    });

    const result = await generateAndPersistMetaSummary(persistence, meetingId, mockSummarizer);

    expect(result).toBeNull();
  });
});
