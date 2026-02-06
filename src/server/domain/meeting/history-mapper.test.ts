import { describe, expect, test } from "bun:test";
import { buildMeetingHistoryMessage } from "./history-mapper";

describe("buildMeetingHistoryMessage", () => {
  test("maps persisted payloads to meeting history message", () => {
    const message = buildMeetingHistoryMessage("550e8400-e29b-41d4-a716-446655440000", {
      transcripts: [
        {
          id: 1,
          sessionId: "s-1",
          text: "hello",
          timestamp: 1,
          isFinal: true,
          speaker: 0,
          startTime: 0,
          isUtteranceEnd: false,
        },
      ],
      analyses: [
        {
          id: 1,
          sessionId: "s-1",
          summary: ["a"],
          topics: ["t"],
          tags: ["tag"],
          flow: 10,
          heat: 20,
          imagePrompt: "p",
          timestamp: 2,
        },
      ],
      images: [
        {
          id: 11,
          sessionId: "s-1",
          filePath: "/tmp/images/11.png",
          prompt: "p",
          timestamp: 3,
        },
      ],
      captures: [
        {
          id: 21,
          sessionId: "s-1",
          filePath: "/tmp/captures/21.png",
          timestamp: 4,
        },
      ],
      metaSummaries: [
        {
          id: "ms-1",
          meetingId: "m-1",
          startTime: 0,
          endTime: 10,
          summary: ["sum"],
          themes: ["theme"],
          representativeImageId: null,
          createdAt: 5,
        },
      ],
      speakerAliases: [
        {
          meetingId: "m-1",
          speaker: 0,
          displayName: "司会",
          updatedAt: 6,
        },
      ],
    });

    expect(message.type).toBe("meeting:history");
    expect(message.data.images[0]?.url).toBe(
      "/api/meetings/550e8400-e29b-41d4-a716-446655440000/images/11",
    );
    expect(message.data.captures[0]?.url).toBe(
      "/api/meetings/550e8400-e29b-41d4-a716-446655440000/captures/21",
    );
    expect(message.data.speakerAliases).toEqual({ "0": "司会" });
  });
});
