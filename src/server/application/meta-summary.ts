import {
  generateAndPersistMetaSummary,
  shouldTriggerMetaSummary,
} from "@/services/server/meta-summary";
import type { OpenAIService } from "@/services/server/openai";
import type { PersistenceService } from "@/services/server/persistence";

export async function checkAndGenerateMetaSummary(
  persistence: PersistenceService,
  meetingId: string,
  openaiService: OpenAIService,
): Promise<void> {
  if (!shouldTriggerMetaSummary(persistence, meetingId)) {
    return;
  }

  console.log(`[MetaSummary] Triggering meta-summary generation for meeting: ${meetingId}`);

  try {
    const result = await generateAndPersistMetaSummary(persistence, meetingId, async (input) => {
      return openaiService.generateMetaSummary({
        analyses: input.analyses.map((a) => ({
          summary: a.summary,
          topics: a.topics,
          timestamp: a.timestamp,
        })),
        startTime: input.startTime,
        endTime: input.endTime,
      });
    });

    if (result) {
      console.log(
        `[MetaSummary] Generated meta-summary: ${result.summary.length} points, ${result.themes.length} themes`,
      );
    }
  } catch (error) {
    console.error("[MetaSummary] Failed to generate meta-summary:", error);
  }
}
