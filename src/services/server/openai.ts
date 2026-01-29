/**
 * OpenAI service for generating summaries, topics, tags, and metrics.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/types/messages.ts, src/services/server/analysis.ts
 */

import OpenAI from "openai";
import { OPENAI_CONFIG } from "@/config/constants";
import type { AnalysisResult, CameraFrame } from "@/types/messages";

export interface AnalysisInput {
  transcript: string;
  previousTopics?: string[];
  cameraFrames?: CameraFrame[];
  previousImage?: { base64: string };
}

export interface OpenAIService {
  analyzeTranscript: (input: AnalysisInput) => Promise<AnalysisResult>;
}

const ANALYSIS_SYSTEM_PROMPT = `You are an expert at analyzing meeting transcripts and creating graphic recording content.

Given a meeting transcript (and optionally visual context from camera snapshots and previous graphic recording), you will:
1. Extract 3-5 key summary points (bullet points)
2. Identify 1-3 main topics being discussed
3. Generate 3-5 relevant hashtags
4. Rate the "flow" (how smoothly the conversation is progressing, 0-100)
5. Rate the "heat" (how engaged/energetic the discussion is, 0-100)
6. Generate a prompt for creating a graphic recording image that captures the essence of the discussion

If camera frames are provided, use them to understand the visual context (participants, gestures, whiteboard content, etc.).
If a previous graphic recording image is provided, ensure continuity and build upon its visual narrative.

The image prompt should be descriptive and suitable for AI image generation.
Focus on visual metaphors and symbols that represent the key concepts.
Keep the language in the same language as the transcript.`;

const ANALYSIS_RESULT_SCHEMA = {
  type: "object",
  properties: {
    summary: {
      type: "array",
      items: { type: "string" },
      description: "3-5 key summary points",
    },
    topics: {
      type: "array",
      items: { type: "string" },
      description: "1-3 main topics being discussed",
    },
    tags: {
      type: "array",
      items: { type: "string" },
      description: "3-5 relevant hashtags",
    },
    flow: {
      type: "number",
      description: "How smoothly the conversation is progressing (0-100)",
    },
    heat: {
      type: "number",
      description: "How engaged/energetic the discussion is (0-100)",
    },
    imagePrompt: {
      type: "string",
      description: "A prompt for creating a graphic recording image",
    },
  },
  required: ["summary", "topics", "tags", "flow", "heat", "imagePrompt"],
  additionalProperties: false,
} as const;

export function createOpenAIService(): OpenAIService {
  const apiKey = process.env["OPENAI_API_KEY"];
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY environment variable is required");
  }

  const client = new OpenAI({ apiKey });

  async function analyzeTranscript(input: AnalysisInput): Promise<AnalysisResult> {
    const { transcript, previousTopics = [], cameraFrames = [], previousImage } = input;

    // Build the input content (multimodal) for Responses API
    type ResponseInputItem = OpenAI.Responses.ResponseInputItem;
    const inputItems: ResponseInputItem[] = [];

    // Build text content
    let textContent = previousTopics.length
      ? `Previous topics discussed: ${previousTopics.join(", ")}\n\nNew transcript segment:\n${transcript}`
      : `Transcript:\n${transcript}`;

    if (cameraFrames.length > 0) {
      textContent += "\n\nThe following camera frames show the visual context of the meeting:";
    }

    if (previousImage) {
      textContent += "\n\nThe following is the previous graphic recording image. Build upon its visual narrative:";
    }

    // Add text as input message
    const messageContent: OpenAI.Responses.ResponseInputContent[] = [
      { type: "input_text", text: textContent },
    ];

    // Add camera frames as images
    for (const frame of cameraFrames) {
      messageContent.push({
        type: "input_image",
        image_url: `data:image/jpeg;base64,${frame.base64}`,
        detail: "low",
      });
    }

    // Add previous graphic recording image
    if (previousImage) {
      messageContent.push({
        type: "input_image",
        image_url: `data:image/png;base64,${previousImage.base64}`,
        detail: "low",
      });
    }

    inputItems.push({
      type: "message",
      role: "user",
      content: messageContent,
    });

    const response = await client.responses.create({
      model: OPENAI_CONFIG.model,
      instructions: ANALYSIS_SYSTEM_PROMPT,
      input: inputItems,
      max_output_tokens: OPENAI_CONFIG.maxTokens,
      text: {
        format: {
          type: "json_schema",
          name: "analysis_result",
          schema: ANALYSIS_RESULT_SCHEMA,
          strict: true,
        },
      },
    });

    // Extract text from Responses API output
    const outputMessage = response.output.find((item) => item.type === "message");
    if (!outputMessage || outputMessage.type !== "message") {
      throw new Error("No message in OpenAI response");
    }

    const textOutput = outputMessage.content.find((c) => c.type === "output_text");
    if (!textOutput || textOutput.type !== "output_text") {
      throw new Error("No text output from OpenAI");
    }

    const result = JSON.parse(textOutput.text) as {
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
