/**
 * Tests for Gemini service generation request construction.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/services/server/gemini.ts
 */

import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";

type MockGeminiPart = { inlineData: { data: string } } | { text: string };
type MockGeminiResponse = {
  candidates: Array<{
    content: {
      parts: MockGeminiPart[];
    };
  }>;
};

let mockGenerateCalls: unknown[] = [];
const mockGenerateContent = mock((params: unknown): Promise<MockGeminiResponse> => {
  mockGenerateCalls.push(params);
  return Promise.resolve({
    candidates: [
      {
        content: {
          parts: [{ inlineData: { data: "generated-base64" } }],
        },
      },
    ],
  });
});

mock.module("@google/genai", () => ({
  GoogleGenAI: class MockGoogleGenAI {
    models = {
      generateContent: mockGenerateContent,
    };
  },
}));

const { createGeminiService } = await import("./gemini");

describe("GeminiService", () => {
  const originalApiKey = process.env["GOOGLE_API_KEY"];

  beforeEach(() => {
    process.env["GOOGLE_API_KEY"] = "test-google-api-key";
    mockGenerateCalls = [];
    mockGenerateContent.mockClear();
  });

  afterEach(() => {
    if (originalApiKey) {
      process.env["GOOGLE_API_KEY"] = originalApiKey;
    } else {
      delete process.env["GOOGLE_API_KEY"];
    }
  });

  test("should throw when GOOGLE_API_KEY is missing", () => {
    delete process.env["GOOGLE_API_KEY"];
    expect(() => createGeminiService()).toThrow("GOOGLE_API_KEY environment variable is required");
  });

  test("should request image-only modality and include style prefix", async () => {
    const service = createGeminiService();
    await service.generateImage("Discuss release timeline and blockers");

    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    const callArgs = mockGenerateCalls[0] as {
      model: string;
      contents: string;
      config: {
        responseModalities: string[];
      };
    };

    expect(callArgs.config.responseModalities).toEqual(["IMAGE"]);
    expect(callArgs.contents).toContain("Return image output only.");
    expect(callArgs.contents).toContain("Content brief:");
    expect(callArgs.contents).toContain("Discuss release timeline and blockers");
  });

  test("should return original prompt in result", async () => {
    const service = createGeminiService();
    const result = await service.generateImage("Original image prompt");

    expect(result.base64).toBe("generated-base64");
    expect(result.prompt).toBe("Original image prompt");
    expect(typeof result.timestamp).toBe("number");
  });

  test("should throw when Gemini response has no image data", async () => {
    mockGenerateContent.mockImplementationOnce((params: unknown): Promise<MockGeminiResponse> => {
      mockGenerateCalls.push(params);
      return Promise.resolve({
        candidates: [
          {
            content: {
              parts: [{ text: "text-only response" }],
            },
          },
        ],
      });
    });

    const service = createGeminiService();
    await expect(service.generateImage("No image case")).rejects.toThrow(
      "No image data in Gemini response",
    );
  });
});
