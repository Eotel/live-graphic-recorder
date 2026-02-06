import { describe, test, expect, mock, beforeEach } from "bun:test";
import { ANALYSIS_INTERVAL_MS } from "@/config/constants";
import { createAnalysisService } from "./analysis";
import { addTranscript, createSession, startSession } from "./session";
import type { AnalysisResult, GenerationPhase, SessionState } from "@/types/messages";
import type { GeminiService } from "./gemini";
import type { OpenAIService } from "./openai";

describe("AnalysisService", () => {
  const analysisResult: AnalysisResult = {
    summary: ["point"],
    topics: ["topic"],
    tags: ["#tag"],
    flow: 70,
    heat: 50,
    imagePrompt: "draw this",
  };

  const generatedImage = {
    base64: "image-base64",
    prompt: "draw this",
    timestamp: 123,
  };

  let session: SessionState;
  let openaiAnalyzeMock: ReturnType<typeof mock>;
  let geminiGenerateMock: ReturnType<typeof mock>;
  let onAnalysisCompleteMock: ReturnType<typeof mock>;
  let onImageCompleteMock: ReturnType<typeof mock>;
  let onErrorMock: ReturnType<typeof mock>;
  let onPhaseChangeMock: ReturnType<typeof mock>;

  beforeEach(() => {
    session = startSession(createSession("session-1"));

    openaiAnalyzeMock = mock(() => Promise.resolve(analysisResult));
    geminiGenerateMock = mock(() => Promise.resolve(generatedImage));
    onAnalysisCompleteMock = mock(() => {});
    onImageCompleteMock = mock(() => {});
    onErrorMock = mock(() => {});
    onPhaseChangeMock = mock((_phase: GenerationPhase, _retryAttempt?: number) => {});
  });

  test("checkAndTrigger should skip when transcript is empty", async () => {
    const openaiService: OpenAIService = {
      analyzeTranscript: (input) => openaiAnalyzeMock(input),
      generateMetaSummary: async () => ({ summary: [], themes: [] }),
    };
    const geminiService: GeminiService = {
      generateImage: (prompt, options) => geminiGenerateMock(prompt, options),
    };

    const service = createAnalysisService(openaiService, geminiService, {
      onAnalysisComplete: onAnalysisCompleteMock,
      onImageComplete: onImageCompleteMock,
      onError: onErrorMock,
      onPhaseChange: onPhaseChangeMock,
    });

    const noTranscriptSession = {
      ...session,
      lastAnalysisAt: Date.now() - ANALYSIS_INTERVAL_MS - 1000,
      wordsSinceLastAnalysis: 10,
    };

    await service.checkAndTrigger(noTranscriptSession);

    expect(openaiAnalyzeMock).not.toHaveBeenCalled();
    expect(onErrorMock).not.toHaveBeenCalled();
    expect(onPhaseChangeMock).not.toHaveBeenCalled();
  });

  test("checkAndTrigger should run analysis when final transcript exists", async () => {
    const openaiService: OpenAIService = {
      analyzeTranscript: (input) => openaiAnalyzeMock(input),
      generateMetaSummary: async () => ({ summary: [], themes: [] }),
    };
    const geminiService: GeminiService = {
      generateImage: (prompt, options) => geminiGenerateMock(prompt, options),
    };

    const service = createAnalysisService(openaiService, geminiService, {
      onAnalysisComplete: onAnalysisCompleteMock,
      onImageComplete: onImageCompleteMock,
      onError: onErrorMock,
      onPhaseChange: onPhaseChangeMock,
    });

    let finalTranscriptSession = {
      ...session,
      lastAnalysisAt: Date.now() - ANALYSIS_INTERVAL_MS - 1000,
    };
    finalTranscriptSession = addTranscript(finalTranscriptSession, {
      text: "this is final transcript text",
      timestamp: Date.now(),
      isFinal: true,
    });

    await service.checkAndTrigger(finalTranscriptSession);
    await Promise.resolve();

    expect(openaiAnalyzeMock).toHaveBeenCalledTimes(1);
    expect(onAnalysisCompleteMock).toHaveBeenCalledTimes(1);
    expect(onAnalysisCompleteMock).toHaveBeenCalledWith(analysisResult);
    expect(onImageCompleteMock).toHaveBeenCalledTimes(1);
    expect(onErrorMock).not.toHaveBeenCalled();
    expect(onPhaseChangeMock).toHaveBeenCalledWith("analyzing");
    expect(onPhaseChangeMock).toHaveBeenCalledWith("generating");
  });
});
