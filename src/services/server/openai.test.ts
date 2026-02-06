/**
 * Tests for OpenAI service using Responses API.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/services/server/openai.ts
 */

import { describe, test, expect, mock, beforeEach, afterEach, afterAll } from "bun:test";

// Mock response matching Responses API structure
const createMockResponse = (
  overrides: {
    summary?: string[];
    topics?: string[];
    tags?: string[];
    flow?: number;
    heat?: number;
    imagePrompt?: string;
  } = {},
) => ({
  id: "resp_test123",
  object: "response",
  created_at: 1741476542,
  status: "completed",
  output: [
    {
      type: "message" as const,
      id: "msg_test123",
      status: "completed",
      role: "assistant" as const,
      content: [
        {
          type: "output_text" as const,
          text: JSON.stringify({
            summary: overrides.summary ?? ["Point 1", "Point 2"],
            topics: overrides.topics ?? ["Topic A"],
            tags: overrides.tags ?? ["#tag1", "#tag2"],
            flow: overrides.flow ?? 75,
            heat: overrides.heat ?? 60,
            imagePrompt: overrides.imagePrompt ?? "A visual representation of the discussion",
          }),
          annotations: [],
        },
      ],
    },
  ],
  model: "gpt-5.2",
  usage: {
    input_tokens: 100,
    output_tokens: 50,
    total_tokens: 150,
  },
});

// Track mock calls
let mockCreateCalls: unknown[] = [];
const mockCreate = mock((params: unknown) => {
  mockCreateCalls.push(params);
  return Promise.resolve(createMockResponse());
});

// Mock OpenAI module
mock.module("openai", () => ({
  default: class MockOpenAI {
    responses = {
      create: mockCreate,
    };
  },
}));

// Import type separately (not affected by mock)
import type { AnalysisInput } from "./openai";

// Import implementation after mocking
const { createOpenAIService } = await import("./openai");

describe("OpenAIService", () => {
  const originalEnv = process.env["OPENAI_API_KEY"];

  beforeEach(() => {
    process.env["OPENAI_API_KEY"] = "test-api-key";
    mockCreateCalls = [];
    mockCreate.mockClear();
  });

  afterEach(() => {
    if (originalEnv) {
      process.env["OPENAI_API_KEY"] = originalEnv;
    } else {
      delete process.env["OPENAI_API_KEY"];
    }
  });

  afterAll(() => {
    mock.restore();
  });

  describe("createOpenAIService", () => {
    test("should throw error when OPENAI_API_KEY is not set", () => {
      delete process.env["OPENAI_API_KEY"];
      expect(() => createOpenAIService()).toThrow(
        "OPENAI_API_KEY environment variable is required",
      );
    });

    test("should create service when OPENAI_API_KEY is set", () => {
      const service = createOpenAIService();
      expect(service).toBeDefined();
      expect(service.analyzeTranscript).toBeFunction();
    });
  });

  describe("analyzeTranscript", () => {
    test("should call Responses API with correct parameters", async () => {
      const service = createOpenAIService();
      const input: AnalysisInput = {
        transcript: "Hello, this is a test transcript.",
        previousTopics: ["Previous topic"],
      };

      await service.analyzeTranscript(input);

      expect(mockCreate).toHaveBeenCalledTimes(1);
      const callArgs = mockCreateCalls[0] as {
        model: string;
        instructions: string;
        input: unknown[];
        max_output_tokens: number;
        text: { format: { type: string; name: string; strict: boolean } };
      };

      // Verify Responses API parameters
      expect(callArgs.model).toBe("gpt-5.2");
      expect(callArgs.instructions).toContain("graphic recording");
      expect(callArgs.max_output_tokens).toBe(1024);
      expect(callArgs.text.format.type).toBe("json_schema");
      expect(callArgs.text.format.name).toBe("analysis_result");
      expect(callArgs.text.format.strict).toBe(true);
      expect(callArgs.input).toBeArray();
      expect(callArgs.input[0]).toMatchObject({
        type: "message",
        role: "user",
      });
    });

    test("should include few-shot guidance in analysis instructions", async () => {
      const service = createOpenAIService();
      await service.analyzeTranscript({
        transcript: "Test transcript",
      });

      const callArgs = mockCreateCalls[0] as {
        instructions: string;
      };

      expect(callArgs.instructions).toContain("Few-shot examples for imagePrompt style");
      expect(callArgs.instructions).toContain("roughly 40-140 words");
    });

    test("should use relaxed bounds in analysis schema", async () => {
      const service = createOpenAIService();
      await service.analyzeTranscript({
        transcript: "Test transcript",
      });

      const callArgs = mockCreateCalls[0] as {
        text: {
          format: {
            schema: {
              properties: {
                summary: { minItems: number; maxItems: number };
                topics: { minItems: number; maxItems: number };
                tags: { minItems: number; maxItems: number };
                flow: { minimum: number; maximum: number };
                heat: { minimum: number; maximum: number };
                imagePrompt: { minLength: number; maxLength: number };
              };
            };
          };
        };
      };

      const schema = callArgs.text.format.schema;
      expect(schema.properties.summary.minItems).toBe(2);
      expect(schema.properties.summary.maxItems).toBe(7);
      expect(schema.properties.topics.minItems).toBe(1);
      expect(schema.properties.topics.maxItems).toBe(5);
      expect(schema.properties.tags.minItems).toBe(2);
      expect(schema.properties.tags.maxItems).toBe(8);
      expect(schema.properties.flow.minimum).toBe(0);
      expect(schema.properties.flow.maximum).toBe(100);
      expect(schema.properties.heat.minimum).toBe(0);
      expect(schema.properties.heat.maximum).toBe(100);
      expect(schema.properties.imagePrompt.minLength).toBe(12);
      expect(schema.properties.imagePrompt.maxLength).toBe(800);
    });

    test("should include previousTopics in input text", async () => {
      const service = createOpenAIService();
      await service.analyzeTranscript({
        transcript: "Test transcript",
        previousTopics: ["Topic A", "Topic B"],
      });

      const callArgs = mockCreateCalls[0] as {
        input: Array<{ content: Array<{ text: string }> }>;
      };
      const textContent = callArgs.input[0]?.content[0]?.text;

      expect(textContent).toContain("Previous topics discussed: Topic A, Topic B");
      expect(textContent).toContain("Test transcript");
    });

    test("should parse Responses API output correctly", async () => {
      const service = createOpenAIService();
      const result = await service.analyzeTranscript({
        transcript: "Test transcript",
      });

      expect(result.summary).toEqual(["Point 1", "Point 2"]);
      expect(result.topics).toEqual(["Topic A"]);
      expect(result.tags).toEqual(["#tag1", "#tag2"]);
      expect(result.flow).toBe(75);
      expect(result.heat).toBe(60);
      expect(result.imagePrompt).toBe("A visual representation of the discussion");
    });

    test("should normalize tags with missing # prefix", async () => {
      mockCreate.mockImplementationOnce(() =>
        Promise.resolve(createMockResponse({ tags: ["tag1", "tag2"] })),
      );

      const service = createOpenAIService();
      const result = await service.analyzeTranscript({
        transcript: "Test transcript",
      });

      expect(result.tags).toEqual(["#tag1", "#tag2"]);
    });

    test("should clamp flow value above 100 to 100", async () => {
      mockCreate.mockImplementationOnce(() => Promise.resolve(createMockResponse({ flow: 150 })));

      const service = createOpenAIService();
      const result = await service.analyzeTranscript({
        transcript: "Test transcript",
      });

      expect(result.flow).toBe(100);
    });

    test("should clamp heat value below 0 to 0", async () => {
      mockCreate.mockImplementationOnce(() => Promise.resolve(createMockResponse({ heat: -20 })));

      const service = createOpenAIService();
      const result = await service.analyzeTranscript({
        transcript: "Test transcript",
      });

      expect(result.heat).toBe(0);
    });

    test("should throw error when response has no message", async () => {
      mockCreate.mockImplementationOnce(() =>
        Promise.resolve({
          ...createMockResponse(),
          output: [],
        }),
      );

      const service = createOpenAIService();
      await expect(service.analyzeTranscript({ transcript: "Test transcript" })).rejects.toThrow(
        "No message in OpenAI response",
      );
    });

    test("should throw error when response has no text output", async () => {
      mockCreate.mockImplementationOnce(() =>
        Promise.resolve({
          ...createMockResponse(),
          output: [
            {
              type: "message" as const,
              id: "msg_test",
              status: "completed",
              role: "assistant" as const,
              content: [], // No content
            },
          ],
        }),
      );

      const service = createOpenAIService();
      await expect(service.analyzeTranscript({ transcript: "Test transcript" })).rejects.toThrow(
        "No text output from OpenAI",
      );
    });

    test("should include camera frames as input_image in request", async () => {
      const service = createOpenAIService();
      await service.analyzeTranscript({
        transcript: "Test transcript",
        cameraFrames: [
          { base64: "base64data1", timestamp: 1000 },
          { base64: "base64data2", timestamp: 2000 },
        ],
      });

      const callArgs = mockCreateCalls[0] as {
        input: Array<{ content: Array<{ type: string; image_url?: string }> }>;
      };
      const messageContent = callArgs.input[0]?.content;

      // Should have text + 2 images
      expect(messageContent?.length).toBe(3);
      expect(messageContent?.[0]?.type).toBe("input_text");
      expect(messageContent?.[1]?.type).toBe("input_image");
      expect(messageContent?.[1]?.image_url).toBe("data:image/jpeg;base64,base64data1");
      expect(messageContent?.[2]?.type).toBe("input_image");
      expect(messageContent?.[2]?.image_url).toBe("data:image/jpeg;base64,base64data2");
    });

    test("should include previousImage as input_image in request", async () => {
      const service = createOpenAIService();
      await service.analyzeTranscript({
        transcript: "Test transcript",
        previousImage: { base64: "previousImageData" },
      });

      const callArgs = mockCreateCalls[0] as {
        input: Array<{ content: Array<{ type: string; image_url?: string }> }>;
      };
      const messageContent = callArgs.input[0]?.content;

      // Should have text + 1 previous image
      expect(messageContent?.length).toBe(2);
      expect(messageContent?.[1]?.type).toBe("input_image");
      expect(messageContent?.[1]?.image_url).toBe("data:image/png;base64,previousImageData");
    });

    test("should handle empty arrays in response gracefully", async () => {
      mockCreate.mockImplementationOnce(() =>
        Promise.resolve(
          createMockResponse({
            summary: [],
            topics: [],
            tags: [],
          }),
        ),
      );

      const service = createOpenAIService();
      const result = await service.analyzeTranscript({
        transcript: "Test transcript",
      });

      expect(result.summary).toEqual([]);
      expect(result.topics).toEqual([]);
      expect(result.tags).toEqual([]);
    });

    test("should use default imagePrompt when not provided", async () => {
      mockCreate.mockImplementationOnce(() =>
        Promise.resolve(createMockResponse({ imagePrompt: "" })),
      );

      const service = createOpenAIService();
      const result = await service.analyzeTranscript({
        transcript: "Test transcript",
      });

      expect(result.imagePrompt).toBe("A professional meeting scene");
    });

    test("should include hierarchical context in input text", async () => {
      const service = createOpenAIService();
      await service.analyzeTranscript({
        transcript: "Test transcript",
        recentAnalyses: [
          {
            id: 1,
            sessionId: "session-1",
            summary: ["Recent point 1", "Recent point 2"],
            topics: ["Recent topic"],
            tags: [],
            flow: 50,
            heat: 50,
            imagePrompt: "test",
            timestamp: 1000,
          },
        ],
        metaSummaries: [
          {
            id: "meta-1",
            meetingId: "meeting-1",
            startTime: 0,
            endTime: 1800000,
            summary: ["Meta summary point"],
            themes: ["Theme A"],
            representativeImageId: null,
            createdAt: 2000,
          },
        ],
        overallThemes: ["Main Theme", "Secondary Theme"],
      });

      const callArgs = mockCreateCalls[0] as {
        input: Array<{ content: Array<{ text: string }> }>;
      };
      const textContent = callArgs.input[0]?.content[0]?.text;

      // Should include Tier 3 (overall themes)
      expect(textContent).toContain("Overall Meeting Themes");
      expect(textContent).toContain("Main Theme");
      expect(textContent).toContain("Secondary Theme");

      // Should include Tier 2 (meta-summaries)
      expect(textContent).toContain("Meeting History");
      expect(textContent).toContain("Meta summary point");
      expect(textContent).toContain("Theme A");

      // Should include Tier 1 (recent analyses)
      expect(textContent).toContain("Recent Discussion Summaries");
      expect(textContent).toContain("Recent point 1");
      expect(textContent).toContain("Recent topic");

      // Should include current transcript
      expect(textContent).toContain("Current Transcript Segment");
      expect(textContent).toContain("Test transcript");
    });

    test("should include recentImages as input_image in request", async () => {
      const service = createOpenAIService();
      await service.analyzeTranscript({
        transcript: "Test transcript",
        recentImages: [
          { base64: "recentImage1", prompt: "Image 1", timestamp: 1000 },
          { base64: "recentImage2", prompt: "Image 2", timestamp: 2000 },
        ],
      });

      const callArgs = mockCreateCalls[0] as {
        input: Array<{ content: Array<{ type: string; image_url?: string }> }>;
      };
      const messageContent = callArgs.input[0]?.content;

      // Should have text + 2 recent images
      expect(messageContent?.length).toBe(3);
      expect(messageContent?.[0]?.type).toBe("input_text");
      expect(messageContent?.[1]?.type).toBe("input_image");
      expect(messageContent?.[1]?.image_url).toBe("data:image/png;base64,recentImage1");
      expect(messageContent?.[2]?.type).toBe("input_image");
      expect(messageContent?.[2]?.image_url).toBe("data:image/png;base64,recentImage2");
    });

    test("should prefer recentImages over previousImage when both provided", async () => {
      const service = createOpenAIService();
      await service.analyzeTranscript({
        transcript: "Test transcript",
        recentImages: [{ base64: "recentImage1", prompt: "Recent", timestamp: 2000 }],
        previousImage: { base64: "oldImage" },
      });

      const callArgs = mockCreateCalls[0] as {
        input: Array<{ content: Array<{ type: string; image_url?: string }> }>;
      };
      const messageContent = callArgs.input[0]?.content;

      // Should have text + 1 recent image (not previousImage)
      expect(messageContent?.length).toBe(2);
      expect(messageContent?.[1]?.image_url).toBe("data:image/png;base64,recentImage1");
    });
  });

  describe("generateMetaSummary", () => {
    test("should call Responses API with correct parameters", async () => {
      mockCreate.mockImplementationOnce((params: unknown) => {
        mockCreateCalls.push(params);
        return Promise.resolve({
          ...createMockResponse(),
          output: [
            {
              type: "message" as const,
              id: "msg_test",
              status: "completed",
              role: "assistant" as const,
              content: [
                {
                  type: "output_text" as const,
                  text: JSON.stringify({
                    summary: ["Consolidated point 1", "Consolidated point 2"],
                    themes: ["Theme A", "Theme B"],
                  }),
                  annotations: [],
                },
              ],
            },
          ],
        });
      });

      const service = createOpenAIService();
      await service.generateMetaSummary({
        analyses: [
          { summary: ["Point 1"], topics: ["Topic 1"], timestamp: 1000 },
          { summary: ["Point 2"], topics: ["Topic 2"], timestamp: 2000 },
        ],
        startTime: 1000,
        endTime: 2000,
      });

      expect(mockCreate).toHaveBeenCalledTimes(1);
      const callArgs = mockCreateCalls[0] as {
        model: string;
        instructions: string;
        text: { format: { name: string } };
      };

      expect(callArgs.model).toBe("gpt-5.2");
      expect(callArgs.instructions).toContain("synthesizing");
      expect(callArgs.text.format.name).toBe("meta_summary_result");
    });

    test("should use relaxed bounds in meta summary schema", async () => {
      mockCreate.mockImplementationOnce((params: unknown) => {
        mockCreateCalls.push(params);
        return Promise.resolve({
          ...createMockResponse(),
          output: [
            {
              type: "message" as const,
              id: "msg_test",
              status: "completed",
              role: "assistant" as const,
              content: [
                {
                  type: "output_text" as const,
                  text: JSON.stringify({
                    summary: ["Consolidated point 1", "Consolidated point 2"],
                    themes: ["Theme A"],
                  }),
                  annotations: [],
                },
              ],
            },
          ],
        });
      });

      const service = createOpenAIService();
      await service.generateMetaSummary({
        analyses: [{ summary: ["Point 1"], topics: ["Topic 1"], timestamp: 1000 }],
        startTime: 1000,
        endTime: 2000,
      });

      const callArgs = mockCreateCalls[0] as {
        text: {
          format: {
            schema: {
              properties: {
                summary: { minItems: number; maxItems: number };
                themes: { minItems: number; maxItems: number };
              };
            };
          };
        };
      };
      const schema = callArgs.text.format.schema;

      expect(schema.properties.summary.minItems).toBe(2);
      expect(schema.properties.summary.maxItems).toBe(7);
      expect(schema.properties.themes.minItems).toBe(1);
      expect(schema.properties.themes.maxItems).toBe(6);
    });

    test("should include analyses in input text", async () => {
      mockCreate.mockImplementationOnce((params: unknown) => {
        mockCreateCalls.push(params);
        return Promise.resolve({
          ...createMockResponse(),
          output: [
            {
              type: "message" as const,
              id: "msg_test",
              status: "completed",
              role: "assistant" as const,
              content: [
                {
                  type: "output_text" as const,
                  text: JSON.stringify({
                    summary: ["Summary"],
                    themes: ["Theme"],
                  }),
                  annotations: [],
                },
              ],
            },
          ],
        });
      });

      const service = createOpenAIService();
      await service.generateMetaSummary({
        analyses: [
          { summary: ["First session summary"], topics: ["Topic A"], timestamp: 1000 },
          { summary: ["Second session summary"], topics: ["Topic B"], timestamp: 2000 },
        ],
        startTime: 1000,
        endTime: 2000,
      });

      const callArgs = mockCreateCalls[0] as {
        input: Array<{ content: Array<{ text: string }> }>;
      };
      const textContent = callArgs.input[0]?.content[0]?.text;

      expect(textContent).toContain("First session summary");
      expect(textContent).toContain("Second session summary");
      expect(textContent).toContain("Topic A");
      expect(textContent).toContain("Topic B");
    });

    test("should return parsed meta-summary result", async () => {
      mockCreate.mockImplementationOnce((params: unknown) => {
        mockCreateCalls.push(params);
        return Promise.resolve({
          ...createMockResponse(),
          output: [
            {
              type: "message" as const,
              id: "msg_test",
              status: "completed",
              role: "assistant" as const,
              content: [
                {
                  type: "output_text" as const,
                  text: JSON.stringify({
                    summary: ["Main takeaway 1", "Main takeaway 2"],
                    themes: ["Innovation", "Collaboration"],
                  }),
                  annotations: [],
                },
              ],
            },
          ],
        });
      });

      const service = createOpenAIService();
      const result = await service.generateMetaSummary({
        analyses: [{ summary: ["Test"], topics: [], timestamp: 1000 }],
        startTime: 1000,
        endTime: 2000,
      });

      expect(result.summary).toEqual(["Main takeaway 1", "Main takeaway 2"]);
      expect(result.themes).toEqual(["Innovation", "Collaboration"]);
    });
  });
});
