/**
 * Analysis orchestrator that triggers periodic analysis of transcripts.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/services/server/openai.ts, src/services/server/gemini.ts
 */

import { ANALYSIS_INTERVAL_MS } from "@/config/constants";
import type { SessionState, AnalysisResult } from "@/types/messages";
import type { OpenAIService } from "./openai";
import type { GeminiService, GeneratedImage } from "./gemini";
import { shouldTriggerAnalysis, getTranscriptSinceLastAnalysis, getLatestTopics } from "./session";

export interface AnalysisServiceEvents {
  onAnalysisComplete: (analysis: AnalysisResult) => void;
  onImageComplete: (image: GeneratedImage) => void;
  onError: (error: Error) => void;
}

export interface AnalysisService {
  checkAndTrigger: (session: SessionState) => Promise<void>;
  forceAnalysis: (session: SessionState) => Promise<AnalysisResult>;
  dispose: () => void;
}

export function createAnalysisService(
  openaiService: OpenAIService,
  geminiService: GeminiService,
  events: AnalysisServiceEvents,
): AnalysisService {
  let analysisInProgress = false;

  async function runAnalysis(session: SessionState): Promise<AnalysisResult> {
    const transcript = getTranscriptSinceLastAnalysis(session);
    if (!transcript.trim()) {
      throw new Error("No transcript content to analyze");
    }

    const previousTopics = getLatestTopics(session);
    const analysis = await openaiService.analyzeTranscript(transcript, previousTopics);

    return analysis;
  }

  async function checkAndTrigger(session: SessionState): Promise<void> {
    if (analysisInProgress) return;
    if (!shouldTriggerAnalysis(session, ANALYSIS_INTERVAL_MS)) return;

    analysisInProgress = true;

    try {
      const analysis = await runAnalysis(session);
      events.onAnalysisComplete(analysis);

      // Generate image in parallel (don't block analysis delivery)
      geminiService
        .generateImage(analysis.imagePrompt)
        .then((image) => events.onImageComplete(image))
        .catch((error) =>
          events.onError(error instanceof Error ? error : new Error(String(error))),
        );
    } catch (error) {
      events.onError(error instanceof Error ? error : new Error(String(error)));
    } finally {
      analysisInProgress = false;
    }
  }

  async function forceAnalysis(session: SessionState): Promise<AnalysisResult> {
    const analysis = await runAnalysis(session);
    events.onAnalysisComplete(analysis);

    // Generate image
    try {
      const image = await geminiService.generateImage(analysis.imagePrompt);
      events.onImageComplete(image);
    } catch (error) {
      events.onError(error instanceof Error ? error : new Error(String(error)));
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
