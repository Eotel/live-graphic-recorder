import { describe, expect, test } from "bun:test";
import { parseWsMessage } from "@/server/presentation/ws/message-validator";

describe("parseWsMessage", () => {
  test("parses valid message with data", () => {
    const parsed = parseWsMessage(
      JSON.stringify({
        type: "meeting:start",
        data: { title: "Weekly", meetingId: "id-1" },
      }),
    );

    expect(parsed).toEqual({
      type: "meeting:start",
      data: { title: "Weekly", meetingId: "id-1" },
    });
  });

  test("parses valid message without data", () => {
    const parsed = parseWsMessage(
      JSON.stringify({
        type: "meeting:list:request",
      }),
    );

    expect(parsed).toEqual({
      type: "meeting:list:request",
    });
  });

  test("returns null for invalid json", () => {
    const parsed = parseWsMessage("{invalid");
    expect(parsed).toBeNull();
  });

  test("returns null when type is missing", () => {
    const parsed = parseWsMessage(JSON.stringify({ data: { x: 1 } }));
    expect(parsed).toBeNull();
  });
});
