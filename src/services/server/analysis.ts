/**
 * Analysis orchestrator that triggers periodic analysis of transcripts.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/services/server/openai.ts, src/services/server/gemini.ts
 */

import { ANALYSIS_INTERVAL_MS } from "@/config/constants";
import type { SessionState, AnalysisResult, GenerationPhase } from "@/types/messages";
import type { OpenAIService } from "./openai";
import type { GeminiService, GeneratedImage } from "./gemini";
import type { PersistenceService } from "./persistence";
import { buildHierarchicalContext, type HierarchicalContext } from "./context-builder";
import {
  shouldTriggerAnalysis,
  getTranscriptSinceLastAnalysis,
  getLatestTopics,
  getCameraFrames,
  getLatestImage,
} from "./session";

export interface AnalysisServiceEvents {
  onAnalysisComplete: (analysis: AnalysisResult) => void;
  onImageComplete: (image: GeneratedImage) => void;
  onError: (error: Error) => void;
  onPhaseChange: (phase: GenerationPhase, retryAttempt?: number) => void;
}

export interface AnalysisService {
  checkAndTrigger: (session: SessionState) => Promise<void>;
  forceAnalysis: (session: SessionState) => Promise<AnalysisResult>;
  dispose: () => void;
}

export interface AnalysisServiceOptions {
  persistence?: PersistenceService;
  meetingId?: string;
}

export function createAnalysisService(
  openaiService: OpenAIService,
  geminiService: GeminiService,
  events: AnalysisServiceEvents,
  options?: AnalysisServiceOptions,
): AnalysisService {
  let analysisInProgress = false;

  async function runAnalysis(session: SessionState): Promise<AnalysisResult> {
    const transcript = getTranscriptSinceLastAnalysis(session);
    if (!transcript.trim()) {
      throw new Error("No transcript content to analyze");
    }

    const previousTopics = getLatestTopics(session);
    const cameraFrames = getCameraFrames(session);
    const latestImage = getLatestImage(session);

    // Build hierarchical context if persistence is available
    let hierarchicalContext: HierarchicalContext | undefined;
    if (options?.persistence && options?.meetingId) {
      hierarchicalContext = await buildHierarchicalContext(
        options.persistence,
        options.meetingId,
        transcript,
        cameraFrames,
      );
    }

    const analysis = await openaiService.analyzeTranscript({
      transcript,
      previousTopics,
      cameraFrames,
      previousImage: latestImage ? { base64: latestImage.base64 } : undefined,
      // Hierarchical context (overrides previousTopics and cameraFrames if provided)
      ...(hierarchicalContext && {
        recentAnalyses: hierarchicalContext.recentAnalyses,
        recentImages: hierarchicalContext.recentImages,
        metaSummaries: hierarchicalContext.metaSummaries,
        overallThemes: hierarchicalContext.overallThemes,
      }),
    });

    return analysis;
  }

  async function checkAndTrigger(session: SessionState): Promise<void> {
    if (analysisInProgress) return;
    if (!shouldTriggerAnalysis(session, ANALYSIS_INTERVAL_MS)) return;
    if (!getTranscriptSinceLastAnalysis(session).trim()) return;

    analysisInProgress = true;
    events.onPhaseChange("analyzing");

    try {
      const analysis = await runAnalysis(session);
      events.onAnalysisComplete(analysis);

      // Generate image (notify phase change)
      events.onPhaseChange("generating");
      geminiService
        .generateImage(analysis.imagePrompt, {
          onRetrying: (attempt) => events.onPhaseChange("retrying", attempt),
        })
        .then((image) => {
          events.onImageComplete(image);
          events.onPhaseChange("idle");
        })
        .catch((error) => {
          events.onError(error instanceof Error ? error : new Error(String(error)));
          events.onPhaseChange("idle");
        });
    } catch (error) {
      events.onError(error instanceof Error ? error : new Error(String(error)));
      events.onPhaseChange("idle");
    } finally {
      analysisInProgress = false;
    }
  }

  async function forceAnalysis(session: SessionState): Promise<AnalysisResult> {
    events.onPhaseChange("analyzing");
    const analysis = await runAnalysis(session);
    events.onAnalysisComplete(analysis);

    // Generate image
    events.onPhaseChange("generating");
    try {
      const image = await geminiService.generateImage(analysis.imagePrompt, {
        onRetrying: (attempt) => events.onPhaseChange("retrying", attempt),
      });
      events.onImageComplete(image);
      events.onPhaseChange("idle");
    } catch (error) {
      events.onError(error instanceof Error ? error : new Error(String(error)));
      events.onPhaseChange("idle");
    }

    return analysis;
  }

  function dispose(): void {
    analysisInProgress = false;
  }

  return {
    checkAndTrigger,
    forceAnalysis,
    dispose,
  };
}
