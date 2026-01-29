/**
 * Meta-summary service for hierarchical context management.
 *
 * Provides functions to determine when to generate meta-summaries and
 * prepare input data for meta-summary generation.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/services/server/persistence.ts, src/services/server/openai.ts
 */

import type { PersistenceService, PersistedAnalysis } from "./persistence";
import { META_SUMMARY_INTERVAL_MS, META_SUMMARY_SESSION_THRESHOLD } from "@/config/constants";

export interface MetaSummaryInput {
  analyses: PersistedAnalysis[];
  startTime: number;
  endTime: number;
}

export interface MetaSummaryGenerationResult {
  summary: string[];
  themes: string[];
}

export type MetaSummarizer = (input: MetaSummaryInput) => Promise<MetaSummaryGenerationResult>;

/**
 * Determine if a meta-summary should be generated for the meeting.
 *
 * Trigger conditions:
 * 1. At least META_SUMMARY_SESSION_THRESHOLD analyses exist since last meta-summary
 * 2. AND either:
 *    a. No meta-summary exists yet, OR
 *    b. At least META_SUMMARY_INTERVAL_MS has passed since the last meta-summary
 */
export function shouldTriggerMetaSummary(
  persistence: PersistenceService,
  meetingId: string,
): boolean {
  const latestMetaSummary = persistence.getLatestMetaSummary(meetingId);
  const allAnalyses = persistence.loadMeetingAnalyses(meetingId);

  if (allAnalyses.length === 0) {
    return false;
  }

  // Get analyses since last meta-summary (or all if none exists)
  const analysesAfterLastMeta = latestMetaSummary
    ? allAnalyses.filter((a) => a.timestamp > latestMetaSummary.endTime)
    : allAnalyses;

  // Check if we have enough analyses
  if (analysesAfterLastMeta.length < META_SUMMARY_SESSION_THRESHOLD) {
    return false;
  }

  // Check if enough time has passed (or no meta-summary exists)
  if (!latestMetaSummary) {
    return true;
  }

  const timeSinceLastMeta = Date.now() - latestMetaSummary.endTime;
  return timeSinceLastMeta >= META_SUMMARY_INTERVAL_MS;
}

/**
 * Prepare input data for meta-summary generation.
 *
 * Returns analyses that occurred after the last meta-summary (or all analyses
 * if no meta-summary exists), along with time range information.
 */
export function prepareMetaSummaryInput(
  persistence: PersistenceService,
  meetingId: string,
): MetaSummaryInput | null {
  const latestMetaSummary = persistence.getLatestMetaSummary(meetingId);
  const allAnalyses = persistence.loadMeetingAnalyses(meetingId);

  if (allAnalyses.length === 0) {
    return null;
  }

  // Get analyses since last meta-summary (or all if none exists)
  const analyses = latestMetaSummary
    ? allAnalyses.filter((a) => a.timestamp > latestMetaSummary.endTime)
    : allAnalyses;

  if (analyses.length === 0) {
    return null;
  }

  // Calculate time range
  const startTime = analyses[0]!.timestamp;
  const endTime = analyses[analyses.length - 1]!.timestamp;

  return {
    analyses,
    startTime,
    endTime,
  };
}

/**
 * Generate a meta-summary from analyses and persist it.
 *
 * Uses the provided summarizer function to generate the meta-summary content,
 * then persists it to the database.
 *
 * @param persistence - The persistence service
 * @param meetingId - The meeting ID
 * @param summarizer - Function that generates summary and themes from analyses
 * @returns The generated meta-summary result, or null if no analyses to summarize
 */
export async function generateAndPersistMetaSummary(
  persistence: PersistenceService,
  meetingId: string,
  summarizer: MetaSummarizer,
): Promise<MetaSummaryGenerationResult | null> {
  const input = prepareMetaSummaryInput(persistence, meetingId);
  if (!input) {
    return null;
  }

  const result = await summarizer(input);

  // Persist the meta-summary
  persistence.persistMetaSummary(meetingId, {
    startTime: input.startTime,
    endTime: input.endTime,
    summary: result.summary,
    themes: result.themes,
    representativeImageId: null, // Could be enhanced to select a representative image
  });

  return result;
}
