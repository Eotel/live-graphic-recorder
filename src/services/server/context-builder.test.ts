/**
 * Context builder tests.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/services/server/context-builder.ts, src/services/server/persistence.ts
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { PersistenceService } from "./persistence";
import { buildHierarchicalContext } from "./context-builder";
import { existsSync, rmSync } from "node:fs";
import type { CameraFrame } from "@/types/messages";

describe("buildHierarchicalContext", () => {
  const testDbPath = ":memory:";
  const testMediaPath = "/tmp/test-context-builder-media";
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

  test("returns empty context when no data exists", async () => {
    const cameraFrames: CameraFrame[] = [];
    const transcript = "Hello world";

    const context = await buildHierarchicalContext(
      persistence,
      meetingId,
      transcript,
      cameraFrames,
    );

    expect(context.transcript).toBe(transcript);
    expect(context.recentAnalyses).toEqual([]);
    expect(context.recentImages).toEqual([]);
    expect(context.metaSummaries).toEqual([]);
    expect(context.overallThemes).toEqual([]);
    expect(context.cameraFrames).toEqual([]);
  });

  test("includes transcript and camera frames", async () => {
    const cameraFrames: CameraFrame[] = [
      { base64: "frame1base64", timestamp: 1000 },
      { base64: "frame2base64", timestamp: 2000 },
    ];
    const transcript = "This is the meeting transcript.";

    const context = await buildHierarchicalContext(
      persistence,
      meetingId,
      transcript,
      cameraFrames,
    );

    expect(context.transcript).toBe(transcript);
    expect(context.cameraFrames).toHaveLength(2);
    expect(context.cameraFrames[0]!.base64).toBe("frame1base64");
  });

  test("includes recent analyses limited to configured count", async () => {
    // Create 5 analyses, should only get the most recent 3
    for (let i = 1; i <= 5; i++) {
      await persistence.persistAnalysisWithTimestamp(
        "session-1",
        {
          summary: [`Summary ${i}`],
          topics: [`Topic ${i}`],
          tags: [],
          flow: 50,
          heat: 50,
          imagePrompt: `Prompt ${i}`,
        },
        i * 100,
      );
    }

    const context = await buildHierarchicalContext(persistence, meetingId, "transcript", []);

    expect(context.recentAnalyses).toHaveLength(3);
    // Should be the most recent 3
    expect(context.recentAnalyses[0]!.summary).toEqual(["Summary 3"]);
    expect(context.recentAnalyses[1]!.summary).toEqual(["Summary 4"]);
    expect(context.recentAnalyses[2]!.summary).toEqual(["Summary 5"]);
  });

  test("includes recent images limited to configured count", async () => {
    const base64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

    // Create 5 images, should only get the most recent 3
    // Add delay to avoid filename collision (timestamp-based)
    for (let i = 1; i <= 5; i++) {
      await persistence.persistImage("session-1", {
        base64,
        prompt: `Image ${i}`,
        timestamp: i * 100,
      });
      if (i < 5) await Bun.sleep(2); // ensure unique filenames
    }

    const context = await buildHierarchicalContext(persistence, meetingId, "transcript", []);

    expect(context.recentImages).toHaveLength(3);
    // Should be the most recent 3 with base64 content loaded
    expect(context.recentImages[0]!.prompt).toBe("Image 3");
    expect(context.recentImages[1]!.prompt).toBe("Image 4");
    expect(context.recentImages[2]!.prompt).toBe("Image 5");
    expect(context.recentImages[0]!.base64).toBe(base64);
  });

  test("includes meta-summaries", async () => {
    persistence.persistMetaSummary(meetingId, {
      startTime: 1000,
      endTime: 2000,
      summary: ["Meta summary 1"],
      themes: ["Theme A"],
      representativeImageId: null,
    });
    persistence.persistMetaSummary(meetingId, {
      startTime: 2000,
      endTime: 3000,
      summary: ["Meta summary 2"],
      themes: ["Theme B"],
      representativeImageId: null,
    });

    const context = await buildHierarchicalContext(persistence, meetingId, "transcript", []);

    expect(context.metaSummaries).toHaveLength(2);
    expect(context.metaSummaries[0]!.summary).toEqual(["Meta summary 1"]);
    expect(context.metaSummaries[1]!.summary).toEqual(["Meta summary 2"]);
  });

  test("extracts overall themes from meta-summaries", async () => {
    persistence.persistMetaSummary(meetingId, {
      startTime: 1000,
      endTime: 2000,
      summary: ["Summary 1"],
      themes: ["Theme A", "Theme B"],
      representativeImageId: null,
    });
    persistence.persistMetaSummary(meetingId, {
      startTime: 2000,
      endTime: 3000,
      summary: ["Summary 2"],
      themes: ["Theme B", "Theme C"],
      representativeImageId: null,
    });

    const context = await buildHierarchicalContext(persistence, meetingId, "transcript", []);

    // Should contain unique themes from all meta-summaries
    expect(context.overallThemes).toContain("Theme A");
    expect(context.overallThemes).toContain("Theme B");
    expect(context.overallThemes).toContain("Theme C");
    expect(context.overallThemes).toHaveLength(3);
  });

  test("handles multiple sessions within a meeting", async () => {
    persistence.createSession(meetingId, "session-2");

    // Add analyses to different sessions
    await persistence.persistAnalysisWithTimestamp(
      "session-1",
      {
        summary: ["Session 1 analysis"],
        topics: ["Topic 1"],
        tags: [],
        flow: 50,
        heat: 50,
        imagePrompt: "Prompt 1",
      },
      100,
    );
    await persistence.persistAnalysisWithTimestamp(
      "session-2",
      {
        summary: ["Session 2 analysis"],
        topics: ["Topic 2"],
        tags: [],
        flow: 60,
        heat: 70,
        imagePrompt: "Prompt 2",
      },
      200,
    );

    const context = await buildHierarchicalContext(persistence, meetingId, "transcript", []);

    expect(context.recentAnalyses).toHaveLength(2);
    // Should be ordered by timestamp
    expect(context.recentAnalyses[0]!.summary).toEqual(["Session 1 analysis"]);
    expect(context.recentAnalyses[1]!.summary).toEqual(["Session 2 analysis"]);
  });

  test("returns partial images when some fail to load", async () => {
    const base64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

    // Create 3 images with delay to avoid filename collision (timestamp-based)
    for (let i = 1; i <= 3; i++) {
      await persistence.persistImage("session-1", {
        base64,
        prompt: `Image ${i}`,
        timestamp: i * 100,
      });
      if (i < 3) await Bun.sleep(2); // ensure unique filenames
    }

    // Delete one of the image files to simulate a failed load
    const imageRecords = persistence.loadRecentMeetingImages(meetingId, 3);
    expect(imageRecords).toHaveLength(3);
    const fileToDelete = imageRecords[0]!.filePath;
    rmSync(fileToDelete);

    const context = await buildHierarchicalContext(persistence, meetingId, "transcript", []);

    // Should have 2 images instead of 3 (one failed to load)
    expect(context.recentImages).toHaveLength(2);
    // Verify the remaining images are the ones that didn't fail
    const prompts = context.recentImages.map((img) => img.prompt);
    expect(prompts).toContain("Image 2");
    expect(prompts).toContain("Image 3");
  });

  test("handles themes with invalid values gracefully", async () => {
    // Create meta-summaries with various theme values
    persistence.persistMetaSummary(meetingId, {
      startTime: 1000,
      endTime: 2000,
      summary: ["Summary 1"],
      themes: ["Valid Theme", "Another Valid"],
      representativeImageId: null,
    });

    // Manually insert a meta-summary with invalid themes via raw SQL
    // to simulate corrupted data
    const db = (
      persistence as unknown as { db: { run: (sql: string, ...params: unknown[]) => void } }
    ).db;
    db.run(
      `INSERT INTO meta_summaries (id, meeting_id, start_time, end_time, summary_json, themes_json, representative_image_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      "invalid-themes-id",
      meetingId,
      2000,
      3000,
      JSON.stringify(["Summary 2"]),
      JSON.stringify(null), // null themes
      null,
      Date.now(),
    );
    db.run(
      `INSERT INTO meta_summaries (id, meeting_id, start_time, end_time, summary_json, themes_json, representative_image_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      "empty-string-themes-id",
      meetingId,
      3000,
      4000,
      JSON.stringify(["Summary 3"]),
      JSON.stringify(["", "  ", "Valid From Mixed"]), // mixed valid/invalid
      null,
      Date.now(),
    );

    const context = await buildHierarchicalContext(persistence, meetingId, "transcript", []);

    // Should only contain valid, non-empty themes
    expect(context.overallThemes).toContain("Valid Theme");
    expect(context.overallThemes).toContain("Another Valid");
    expect(context.overallThemes).toContain("Valid From Mixed");
    expect(context.overallThemes).not.toContain("");
    expect(context.overallThemes).not.toContain("  ");
  });

  test("handles empty themes array gracefully", async () => {
    persistence.persistMetaSummary(meetingId, {
      startTime: 1000,
      endTime: 2000,
      summary: ["Summary 1"],
      themes: [],
      representativeImageId: null,
    });

    const context = await buildHierarchicalContext(persistence, meetingId, "transcript", []);

    expect(context.overallThemes).toEqual([]);
    expect(context.metaSummaries).toHaveLength(1);
  });
});
