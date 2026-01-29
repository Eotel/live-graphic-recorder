/**
 * Gemini service for generating graphic recording images.
 * Uses gemini-2.5-flash-image for native image generation.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/types/messages.ts, src/services/server/analysis.ts
 */

import { GoogleGenAI } from "@google/genai";
import { GEMINI_CONFIG } from "@/config/constants";

export interface GeneratedImage {
  base64: string;
  prompt: string;
  timestamp: number;
}

export interface GeminiService {
  generateImage: (prompt: string) => Promise<GeneratedImage>;
}

const GRAPHIC_RECORDING_STYLE_PREFIX = `Create a professional graphic recording illustration with the following characteristics:
- Hand-drawn sketch style with clean lines
- Uses simple icons and symbols
- Includes text labels and annotations
- Color palette: warm earth tones with accent colors
- Visual metaphors and mind-map style layout
- Whiteboard/paper texture background

Content to illustrate: `;

export function createGeminiService(): GeminiService {
  const apiKey = process.env["GOOGLE_API_KEY"];
  if (!apiKey) {
    throw new Error("GOOGLE_API_KEY environment variable is required");
  }

  const ai = new GoogleGenAI({ apiKey });

  async function generateImage(prompt: string): Promise<GeneratedImage> {
    const fullPrompt = GRAPHIC_RECORDING_STYLE_PREFIX + prompt;

    const response = await ai.models.generateContent({
      model: GEMINI_CONFIG.model,
      contents: fullPrompt,
    });

    const candidate = response.candidates?.[0];
    if (!candidate?.content?.parts) {
      throw new Error("No response from Gemini");
    }

    for (const part of candidate.content.parts) {
      if (part.inlineData?.data) {
        return {
          base64: part.inlineData.data,
          prompt,
          timestamp: Date.now(),
        };
      }
    }

    throw new Error("No image data in Gemini response");
  }

  return {
    generateImage,
  };
}
