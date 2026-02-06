/**
 * Gemini service for generating graphic recording images.
 * Uses gemini-2.5-flash-image for native image generation.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/types/messages.ts, src/services/server/analysis.ts
 */

import { GoogleGenAI } from "@google/genai";
import { GEMINI_CONFIG } from "@/config/constants";
import type { ImageModelPreset } from "@/types/messages";

export interface GeneratedImage {
  base64: string;
  prompt: string;
  timestamp: number;
}

export interface GeminiServiceOptions {
  onRetrying?: (attempt: number) => void;
}

export interface GeminiImageModelConfig {
  flash: string;
  pro?: string;
}

export interface CreateGeminiServiceOptions {
  /**
   * Optional model selector. Called for each generation so the model can be
   * switched dynamically (e.g., via WebSocket toggle).
   */
  getModel?: () => string;
}

export interface GeminiService {
  generateImage: (prompt: string, options?: GeminiServiceOptions) => Promise<GeneratedImage>;
}

const GRAPHIC_RECORDING_STYLE_PREFIX = `Create a professional graphic recording illustration with the following characteristics:
- Hand-drawn sketch style with clean lines
- Uses simple icons and symbols
- Includes text labels and annotations
- Color palette: warm earth tones with accent colors
- Visual metaphors and mind-map style layout
- Whiteboard/paper texture background

Content to illustrate: `;

/**
 * Sleep for a given number of milliseconds.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if an error is a rate limit error (429 or RESOURCE_EXHAUSTED).
 */
export function isRateLimitError(error: unknown): boolean {
  if (error instanceof Error) {
    if ((error as unknown as { status?: number }).status === 429) {
      return true;
    }
    if (error.message.includes("RESOURCE_EXHAUSTED")) {
      return true;
    }
  }
  return false;
}

/**
 * Parse the retry delay from an error, if present.
 * Returns the delay in seconds, or null if not found.
 */
export function parseRetryDelay(error: unknown): number | null {
  if (error && typeof error === "object" && "retryDelay" in error) {
    const delay = (error as { retryDelay: unknown }).retryDelay;
    if (typeof delay === "number") {
      return delay;
    }
  }
  return null;
}

export function getGeminiImageModelConfig(): GeminiImageModelConfig {
  const flash = process.env["GEMINI_IMAGE_MODEL_FLASH"] || GEMINI_CONFIG.model;
  const pro = process.env["GEMINI_IMAGE_MODEL_PRO"] || undefined;
  return { flash, pro };
}

export function resolveGeminiImageModel(
  preset: ImageModelPreset,
  config: GeminiImageModelConfig = getGeminiImageModelConfig(),
): string {
  if (preset === "pro" && config.pro) return config.pro;
  return config.flash;
}

export function createGeminiService(options: CreateGeminiServiceOptions = {}): GeminiService {
  const apiKey = process.env["GOOGLE_API_KEY"];
  if (!apiKey) {
    throw new Error("GOOGLE_API_KEY environment variable is required");
  }

  const ai = new GoogleGenAI({ apiKey });

  async function doGenerate(fullPrompt: string): Promise<GeneratedImage> {
    const model = options.getModel?.() ?? GEMINI_CONFIG.model;
    const response = await ai.models.generateContent({
      model,
      contents: fullPrompt,
      config: {
        imageConfig: {
          aspectRatio: GEMINI_CONFIG.aspectRatio,
        },
      },
    });

    const candidate = response.candidates?.[0];
    if (!candidate?.content?.parts) {
      throw new Error("No response from Gemini");
    }

    for (const part of candidate.content.parts) {
      if (part.inlineData?.data) {
        return {
          base64: part.inlineData.data,
          prompt: fullPrompt,
          timestamp: Date.now(),
        };
      }
    }

    throw new Error("No image data in Gemini response");
  }

  async function generateImage(
    prompt: string,
    options?: GeminiServiceOptions,
  ): Promise<GeneratedImage> {
    const fullPrompt = GRAPHIC_RECORDING_STYLE_PREFIX + prompt;
    const maxRetries = GEMINI_CONFIG.maxRetries;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const result = await doGenerate(fullPrompt);
        // Fix prompt to be the original prompt, not the full prompt
        return {
          ...result,
          prompt,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (isRateLimitError(error)) {
          const parsedDelay = parseRetryDelay(error);
          const backoffMs =
            parsedDelay !== null
              ? parsedDelay * 1000
              : GEMINI_CONFIG.initialBackoffMs * (attempt + 1);

          console.log(
            `[Gemini] Rate limited, retrying in ${backoffMs / 1000}s (attempt ${attempt + 1}/${maxRetries})`,
          );

          // Notify retry callback before sleeping
          options?.onRetrying?.(attempt + 1);

          await sleep(backoffMs);
          continue;
        }

        // Non-rate-limit error, don't retry
        throw lastError;
      }
    }

    // All retries exhausted
    throw lastError ?? new Error("Max retries exceeded");
  }

  return {
    generateImage,
  };
}
