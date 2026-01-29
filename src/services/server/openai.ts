/**
 * OpenAI service for generating summaries, topics, tags, and metrics.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/types/messages.ts, src/services/server/analysis.ts
 */

import OpenAI from "openai";
import { OPENAI_CONFIG } from "@/config/constants";
import type { AnalysisResult, CameraFrame } from "@/types/messages";

import type { PersistedAnalysis, PersistedMetaSummary } from "./persistence";

export interface RecentImageContext {
  base64: string;
  prompt: string;
  timestamp: number;
}

export interface AnalysisInput {
  transcript: string;
  previousTopics?: string[];
  cameraFrames?: CameraFrame[];
  previousImage?: { base64: string };
  // Hierarchical context (Tier 1-3)
  recentAnalyses?: PersistedAnalysis[];
  recentImages?: RecentImageContext[];
  metaSummaries?: PersistedMetaSummary[];
  overallThemes?: string[];
}

export interface MetaSummaryResult {
  summary: string[];
  themes: string[];
}

export interface MetaSummaryGenerationInput {
  analyses: Array<{
    summary: string[];
    topics: string[];
    timestamp: number;
  }>;
  startTime: number;
  endTime: number;
}

export interface OpenAIService {
  analyzeTranscript: (input: AnalysisInput) => Promise<AnalysisResult>;
  generateMetaSummary: (input: MetaSummaryGenerationInput) => Promise<MetaSummaryResult>;
}

const ANALYSIS_SYSTEM_PROMPT = `You are an expert at analyzing meeting transcripts and creating graphic recording content.

Given a meeting transcript (and optionally visual context from camera snapshots and previous graphic recording), you will:
1. Extract 3-5 key summary points (bullet points)
2. Identify 1-3 main topics being discussed
3. Generate 3-5 relevant hashtags
4. Rate the "flow" (how smoothly the conversation is progressing, 0-100)
5. Rate the "heat" (how engaged/energetic the discussion is, 0-100)
6. Generate a prompt for creating a graphic recording image that captures the essence of the discussion

CONTEXT HIERARCHY:
You may receive context at different levels:
- Tier 1 (Short-term): Current transcript, recent analyses summaries, recent graphic recording images
- Tier 2 (Medium-term): Meta-summaries representing 30-minute blocks of the meeting
- Tier 3 (Long-term): Overall themes accumulated throughout the meeting

Use this hierarchical context to:
- Maintain narrative continuity with recent discussions (Tier 1)
- Understand the broader meeting arc and key transitions (Tier 2)
- Keep the overall meeting themes and goals in focus (Tier 3)
- Avoid repetition by referencing what was already covered

If camera frames are provided, use them to understand the visual context (participants, gestures, whiteboard content, etc.).
If recent graphic recording images are provided, ensure visual continuity and build upon their narrative.

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

const META_SUMMARY_SYSTEM_PROMPT = `You are an expert at synthesizing meeting discussion summaries.

Given a collection of 5-minute analysis summaries from a meeting, you will:
1. Consolidate them into 3-5 high-level summary points that capture the key discussions
2. Extract 2-4 main themes that emerged during this period

Focus on:
- Identifying patterns and recurring topics across the summaries
- Highlighting key decisions or conclusions reached
- Noting any significant transitions in discussion
- Capturing the overall narrative arc of this meeting segment

Keep the language in the same language as the input summaries.`;

const META_SUMMARY_RESULT_SCHEMA = {
  type: "object",
  properties: {
    summary: {
      type: "array",
      items: { type: "string" },
      description: "3-5 consolidated summary points",
    },
    themes: {
      type: "array",
      items: { type: "string" },
      description: "2-4 main themes from this period",
    },
  },
  required: ["summary", "themes"],
  additionalProperties: false,
} as const;

export function createOpenAIService(): OpenAIService {
  const apiKey = process.env["OPENAI_API_KEY"];
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY environment variable is required");
  }

  const client = new OpenAI({ apiKey });

  async function analyzeTranscript(input: AnalysisInput): Promise<AnalysisResult> {
    const {
      transcript,
      previousTopics = [],
      cameraFrames = [],
      previousImage,
      recentAnalyses = [],
      recentImages = [],
      metaSummaries = [],
      overallThemes = [],
    } = input;

    // Build the input content (multimodal) for Responses API
    type ResponseInputItem = OpenAI.Responses.ResponseInputItem;
    const inputItems: ResponseInputItem[] = [];

    // Build text content with hierarchical context
    let textContent = "";

    // Tier 3: Long-term context (overall themes)
    if (overallThemes.length > 0) {
      textContent += `## Overall Meeting Themes\n${overallThemes.join(", ")}\n\n`;
    }

    // Tier 2: Medium-term context (meta-summaries)
    if (metaSummaries.length > 0) {
      textContent += "## Meeting History (30-minute blocks)\n";
      for (const meta of metaSummaries) {
        const blockTime = new Date(meta.startTime).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });
        textContent += `### Block starting at ${blockTime}\n`;
        textContent += `Key points: ${meta.summary.join("; ")}\n`;
        if (meta.themes.length > 0) {
          textContent += `Themes: ${meta.themes.join(", ")}\n`;
        }
        textContent += "\n";
      }
    }

    // Tier 1: Short-term context (recent analyses summaries)
    if (recentAnalyses.length > 0) {
      textContent += "## Recent Discussion Summaries\n";
      for (const analysis of recentAnalyses) {
        textContent += `- ${analysis.summary.join("; ")}\n`;
        if (analysis.topics.length > 0) {
          textContent += `  Topics: ${analysis.topics.join(", ")}\n`;
        }
      }
      textContent += "\n";
    }

    // Backward compatibility: previousTopics
    if (previousTopics.length > 0) {
      textContent += `Previous topics discussed: ${previousTopics.join(", ")}\n\n`;
    }

    // Current transcript segment
    textContent += `## Current Transcript Segment\n${transcript}`;

    if (cameraFrames.length > 0) {
      textContent += "\n\nThe following camera frames show the visual context of the meeting:";
    }

    if (recentImages.length > 0) {
      textContent +=
        "\n\nThe following are recent graphic recording images. Ensure visual continuity:";
    } else if (previousImage) {
      textContent +=
        "\n\nThe following is the previous graphic recording image. Build upon its visual narrative:";
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

    // Add recent graphic recording images (Tier 1)
    if (recentImages.length > 0) {
      for (const img of recentImages) {
        messageContent.push({
          type: "input_image",
          image_url: `data:image/png;base64,${img.base64}`,
          detail: "low",
        });
      }
    } else if (previousImage) {
      // Backward compatibility: previousImage
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

  async function generateMetaSummary(
    input: MetaSummaryGenerationInput,
  ): Promise<MetaSummaryResult> {
    const { analyses, startTime, endTime } = input;

    // Build text content from analyses
    let textContent = `## Meeting Segment Analysis\n`;
    textContent += `Time period: ${new Date(startTime).toLocaleTimeString()} - ${new Date(endTime).toLocaleTimeString()}\n\n`;
    textContent += `### Individual Session Summaries:\n`;

    for (const analysis of analyses) {
      const time = new Date(analysis.timestamp).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
      textContent += `\n**${time}:**\n`;
      textContent += `- Summary: ${analysis.summary.join("; ")}\n`;
      if (analysis.topics.length > 0) {
        textContent += `- Topics: ${analysis.topics.join(", ")}\n`;
      }
    }

    type ResponseInputItem = OpenAI.Responses.ResponseInputItem;
    const inputItems: ResponseInputItem[] = [
      {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: textContent }],
      },
    ];

    const response = await client.responses.create({
      model: OPENAI_CONFIG.model,
      instructions: META_SUMMARY_SYSTEM_PROMPT,
      input: inputItems,
      max_output_tokens: OPENAI_CONFIG.maxTokens,
      text: {
        format: {
          type: "json_schema",
          name: "meta_summary_result",
          schema: META_SUMMARY_RESULT_SCHEMA,
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
      themes: string[];
    };

    return {
      summary: Array.isArray(result.summary) ? result.summary : [],
      themes: Array.isArray(result.themes) ? result.themes : [],
    };
  }

  return {
    analyzeTranscript,
    generateMetaSummary,
  };
}
