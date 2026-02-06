import { describe, expect, test } from "bun:test";
import { speakerAliasArrayToMap } from "./speaker-alias";

describe("speakerAliasArrayToMap", () => {
  test("maps valid aliases only", () => {
    const map = speakerAliasArrayToMap([
      { speaker: 0, displayName: "司会" },
      { speaker: -1, displayName: "invalid" },
      { speaker: 2, displayName: "  " },
      { speaker: 3, displayName: "参加者A" },
    ]);

    expect(map).toEqual({
      "0": "司会",
      "3": "参加者A",
    });
  });
});
