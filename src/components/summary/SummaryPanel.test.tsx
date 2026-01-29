/**
 * Tests for SummaryPanel component.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/components/summary/SummaryPanel.tsx
 */

import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { render, screen, cleanup } from "@testing-library/react";
import { SummaryPanel } from "./SummaryPanel";
import type { TranscriptSegment } from "@/types/messages";

// Mock useAutoScroll hook
mock.module("@/hooks/useAutoScroll", () => ({
  useAutoScroll: () => ({ containerRef: { current: null } }),
}));

describe("SummaryPanel", () => {
  afterEach(() => {
    cleanup();
  });
  describe("transcript display", () => {
    test("shows placeholder when no segments and no interim text", () => {
      render(
        <SummaryPanel
          summaryPoints={[]}
          transcriptSegments={[]}
          interimText={null}
        />
      );

      expect(
        screen.getByText("Start recording to see the transcript...")
      ).toBeDefined();
    });

    test("displays final segments with default text color", () => {
      const segments: TranscriptSegment[] = [
        { text: "Hello world", timestamp: 1000, isFinal: true },
        { text: "How are you", timestamp: 2000, isFinal: true },
      ];

      render(
        <SummaryPanel
          summaryPoints={[]}
          transcriptSegments={segments}
          interimText={null}
        />
      );

      // Final segments should be rendered without muted class
      const helloSpan = screen.getByText("Hello world");
      const howSpan = screen.getByText("How are you");

      expect(helloSpan).toBeDefined();
      expect(howSpan).toBeDefined();
      expect(helloSpan.className).not.toContain("text-muted-foreground");
      expect(howSpan.className).not.toContain("text-muted-foreground");
    });

    test("displays interim text with muted styling", () => {
      render(
        <SummaryPanel
          summaryPoints={[]}
          transcriptSegments={[]}
          interimText="typing in progress"
        />
      );

      const interimSpan = screen.getByText("typing in progress");
      expect(interimSpan).toBeDefined();
      expect(interimSpan.className).toContain("text-muted-foreground");
    });

    test("displays both final segments and interim text together", () => {
      const segments: TranscriptSegment[] = [
        { text: "Confirmed text", timestamp: 1000, isFinal: true },
      ];

      render(
        <SummaryPanel
          summaryPoints={[]}
          transcriptSegments={segments}
          interimText="still typing"
        />
      );

      const finalSpan = screen.getByText("Confirmed text");
      const interimSpan = screen.getByText("still typing");

      expect(finalSpan).toBeDefined();
      expect(interimSpan).toBeDefined();
      expect(finalSpan.className).not.toContain("text-muted-foreground");
      expect(interimSpan.className).toContain("text-muted-foreground");
    });

    test("interim text has transition class for smooth color change", () => {
      render(
        <SummaryPanel
          summaryPoints={[]}
          transcriptSegments={[]}
          interimText="transitioning"
        />
      );

      const interimSpan = screen.getByText("transitioning");
      expect(interimSpan.className).toContain("transition-colors");
    });
  });

  describe("summary points", () => {
    test("displays summary points when provided", () => {
      render(
        <SummaryPanel
          summaryPoints={["Point one", "Point two"]}
          transcriptSegments={[]}
          interimText={null}
        />
      );

      expect(screen.getByText("Point one")).toBeDefined();
      expect(screen.getByText("Point two")).toBeDefined();
    });

    test("hides summary section when no points", () => {
      render(
        <SummaryPanel
          summaryPoints={[]}
          transcriptSegments={[]}
          interimText={null}
        />
      );

      expect(screen.queryByText("Summary")).toBeNull();
    });
  });
});
