/**
 * Hierarchical context builder for long meeting support.
 *
 * Builds a multi-tier context from persisted data:
 * - Tier 1 (Short-term): Current transcript, recent analyses, recent images, camera frames
 * - Tier 2 (Medium-term): Meta-summaries (30-minute compressed blocks)
 * - Tier 3 (Long-term): Overall themes extracted from meta-summaries
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/services/server/persistence.ts, src/services/server/openai.ts
 */

import type { CameraFrame } from "@/types/messages";
import type { PersistenceService, PersistedMetaSummary, PersistedAnalysis } from "./persistence";
import { RECENT_ANALYSES_COUNT, RECENT_IMAGES_COUNT } from "@/config/constants";

export interface RecentImage {
  base64: string;
  prompt: string;
  timestamp: number;
}

export interface HierarchicalContext {
  // Tier 1: Short-term context (updated each session)
  transcript: string;
  recentAnalyses: PersistedAnalysis[];
  recentImages: RecentImage[];
  cameraFrames: CameraFrame[];

  // Tier 2: Medium-term context (generated every 30 minutes)
  metaSummaries: PersistedMetaSummary[];

  // Tier 3: Long-term context (accumulated)
  overallThemes: string[];
}

/**
 * Build hierarchical context from persisted data for a meeting.
 *
 * This function retrieves and organizes context across three tiers:
 * - Tier 1: Current transcript, recent analyses (limited), recent images (limited), camera frames
 * - Tier 2: All meta-summaries for the meeting
 * - Tier 3: Unique themes extracted from meta-summaries
 */
export async function buildHierarchicalContext(
  persistence: PersistenceService,
  meetingId: string,
  currentTranscript: string,
  cameraFrames: CameraFrame[],
): Promise<HierarchicalContext> {
  // Tier 1: Short-term context with safe limits
  const analysesLimit = Math.max(0, RECENT_ANALYSES_COUNT);
  const imagesLimit = Math.max(0, RECENT_IMAGES_COUNT);

  const recentAnalyses =
    analysesLimit > 0
      ? persistence.loadRecentMeetingAnalyses(meetingId, analysesLimit)
      : [];
  const recentImageRecords =
    imagesLimit > 0
      ? persistence.loadRecentMeetingImages(meetingId, imagesLimit)
      : [];

  // Load base64 for recent images with error handling
  const imageResults = await Promise.allSettled(
    recentImageRecords.map(async (record) => ({
      base64: await persistence.loadImageBase64(record.filePath),
      prompt: record.prompt,
      timestamp: record.timestamp,
    })),
  );

  const recentImages: RecentImage[] = imageResults
    .filter(
      (result): result is PromiseFulfilledResult<RecentImage> =>
        result.status === "fulfilled",
    )
    .map((result) => result.value);

  // Log failed image loads for debugging
  const failedImages = imageResults.filter(
    (result) => result.status === "rejected",
  );
  if (failedImages.length > 0) {
    console.warn(
      `[ContextBuilder] Failed to load ${failedImages.length} image(s), skipping`,
    );
  }

  // Tier 2: Medium-term context
  const metaSummaries = persistence.loadMetaSummaries(meetingId);

  // Tier 3: Long-term context - extract unique themes with type safety
  const allThemes = metaSummaries.flatMap((ms) =>
    Array.isArray(ms.themes)
      ? ms.themes.filter(
          (t): t is string => typeof t === "string" && t.trim() !== "",
        )
      : [],
  );
  const overallThemes = [...new Set(allThemes)];

  return {
    transcript: currentTranscript,
    recentAnalyses,
    recentImages,
    cameraFrames,
    metaSummaries,
    overallThemes,
  };
}
