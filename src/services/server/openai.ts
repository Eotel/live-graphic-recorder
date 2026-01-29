/**
 * OpenAI service for generating summaries, topics, tags, and metrics.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/types/messages.ts, src/services/server/analysis.ts
 */

import OpenAI from "openai";
import { OPENAI_CONFIG } from "@/config/constants";
import type { AnalysisResult } from "@/types/messages";

export interface OpenAIService {
  analyzeTranscript: (transcript: string, previousTopics?: string[]) => Promise<AnalysisResult>;
}

const ANALYSIS_SYSTEM_PROMPT = `You are an expert at analyzing meeting transcripts and creating graphic recording content.

Given a meeting transcript, you will:
1. Extract 3-5 key summary points (bullet points)
2. Identify 1-3 main topics being discussed
3. Generate 3-5 relevant hashtags
4. Rate the "flow" (how smoothly the conversation is progressing, 0-100)
5. Rate the "heat" (how engaged/energetic the discussion is, 0-100)
6. Generate a prompt for creating a graphic recording image that captures the essence of the discussion

Respond in JSON format:
{
  "summary": ["point 1", "point 2", ...],
  "topics": ["topic 1", "topic 2", ...],
  "tags": ["#tag1", "#tag2", ...],
  "flow": 75,
  "heat": 60,
  "imagePrompt": "A visual representation of..."
}

The image prompt should be descriptive and suitable for AI image generation.
Focus on visual metaphors and symbols that represent the key concepts.
Keep the language in the same language as the transcript.`;

export function createOpenAIService(): OpenAIService {
  const apiKey = process.env["OPENAI_API_KEY"];
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY environment variable is required");
  }

  const client = new OpenAI({ apiKey });

  async function analyzeTranscript(
    transcript: string,
    previousTopics: string[] = [],
  ): Promise<AnalysisResult> {
    const userPrompt = previousTopics.length
      ? `Previous topics discussed: ${previousTopics.join(", ")}\n\nNew transcript segment:\n${transcript}`
      : `Transcript:\n${transcript}`;

    const response = await client.chat.completions.create({
      model: OPENAI_CONFIG.model,
      max_tokens: OPENAI_CONFIG.maxTokens,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: ANALYSIS_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No response from OpenAI");
    }

    const result = JSON.parse(content) as {
      summary: string[];
      topics: string[];
      tags: string[];
      flow: number;
      heat: number;
      imagePrompt: string;
    };

    // Validate and normalize the result
    return {
      summary: Array.isArray(result.summary) ? result.summary : [],
      topics: Array.isArray(result.topics) ? result.topics : [],
      tags: Array.isArray(result.tags)
        ? result.tags.map((t) => (t.startsWith("#") ? t : `#${t}`))
        : [],
      flow: Math.max(0, Math.min(100, Number(result.flow) || 50)),
      heat: Math.max(0, Math.min(100, Number(result.heat) || 50)),
      imagePrompt: String(result.imagePrompt || "A professional meeting scene"),
    };
  }

  return {
    analyzeTranscript,
  };
}
