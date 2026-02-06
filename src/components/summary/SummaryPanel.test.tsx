/**
 * Tests for SummaryPanel component.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/components/summary/SummaryPanel.tsx
 */

import { describe, test, expect, afterEach, afterAll, mock } from "bun:test";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { SummaryPanel } from "./SummaryPanel";
import type { TranscriptSegment, SummaryPage } from "@/types/messages";

// Mock useAutoScroll hook
mock.module("@/hooks/useAutoScroll", () => ({
  useAutoScroll: () => ({ containerRef: { current: null } }),
}));

describe("SummaryPanel", () => {
  afterEach(() => {
    cleanup();
  });

  afterAll(() => {
    mock.restore();
  });

  describe("transcript display", () => {
    test("shows placeholder when no segments and no interim text", () => {
      render(<SummaryPanel summaryPages={[]} transcriptSegments={[]} interimText={null} />);

      expect(screen.getByText("Start recording to see the transcript...")).toBeDefined();
    });

    test("displays final segments grouped by utterance", () => {
      const segments: TranscriptSegment[] = [
        { text: "Hello world", timestamp: 1000, isFinal: true, speaker: 0, startTime: 0 },
        { text: "How are you", timestamp: 2000, isFinal: true, speaker: 0, startTime: 1 },
      ];

      render(<SummaryPanel summaryPages={[]} transcriptSegments={segments} interimText={null} />);

      // Segments from same speaker without utterance end are grouped together
      expect(screen.getByText("Hello world How are you")).toBeDefined();
    });

    test("displays interim text with muted styling", () => {
      render(
        <SummaryPanel summaryPages={[]} transcriptSegments={[]} interimText="typing in progress" />,
      );

      // In the new UI, interim text is part of TranscriptLine with italic styling
      const interimSpan = screen.getByText("typing in progress");
      expect(interimSpan).toBeDefined();
      expect(interimSpan.className).toContain("italic");
    });

    test("displays both final segments and interim text together", () => {
      const segments: TranscriptSegment[] = [
        {
          text: "Confirmed text",
          timestamp: 1000,
          isFinal: true,
          speaker: 0,
          startTime: 0,
          isUtteranceEnd: true,
        },
      ];

      render(
        <SummaryPanel
          summaryPages={[]}
          transcriptSegments={segments}
          interimText="still typing"
          interimSpeaker={0}
          interimStartTime={1}
        />,
      );

      // Since the first segment has isUtteranceEnd, they will be separate
      expect(screen.getByText("Confirmed text")).toBeDefined();
      expect(screen.getByText("still typing")).toBeDefined();
    });

    test("groups segments until utterance end", () => {
      const segments: TranscriptSegment[] = [
        { text: "First part", timestamp: 1000, isFinal: true, speaker: 0, startTime: 0 },
        {
          text: "second part",
          timestamp: 2000,
          isFinal: true,
          speaker: 0,
          startTime: 1,
          isUtteranceEnd: true,
        },
        { text: "New utterance", timestamp: 3000, isFinal: true, speaker: 0, startTime: 2 },
      ];

      render(<SummaryPanel summaryPages={[]} transcriptSegments={segments} interimText={null} />);

      // First two segments should be grouped, third is separate
      expect(screen.getByText("First part second part")).toBeDefined();
      expect(screen.getByText("New utterance")).toBeDefined();
    });

    test("splits on speaker change", () => {
      const segments: TranscriptSegment[] = [
        { text: "Speaker A says", timestamp: 1000, isFinal: true, speaker: 0, startTime: 0 },
        { text: "Speaker B responds", timestamp: 2000, isFinal: true, speaker: 1, startTime: 1 },
      ];

      render(<SummaryPanel summaryPages={[]} transcriptSegments={segments} interimText={null} />);

      expect(screen.getByText("Speaker A says")).toBeDefined();
      expect(screen.getByText("Speaker B responds")).toBeDefined();
    });

    test("displays speaker labels when speaker info is present", () => {
      const segments: TranscriptSegment[] = [
        { text: "Hello", timestamp: 1000, isFinal: true, speaker: 0, startTime: 0 },
      ];

      render(<SummaryPanel summaryPages={[]} transcriptSegments={segments} interimText={null} />);

      expect(screen.getByText("Speaker 1:")).toBeDefined();
    });

    test("displays speaker aliases when provided", () => {
      const segments: TranscriptSegment[] = [
        { text: "Hello", timestamp: 1000, isFinal: true, speaker: 0, startTime: 0 },
      ];

      render(
        <SummaryPanel
          summaryPages={[]}
          transcriptSegments={segments}
          interimText={null}
          speakerAliases={{ 0: "田中" }}
        />,
      );

      expect(screen.getByText("田中:")).toBeDefined();
    });
  });

  describe("summary pages", () => {
    test("displays summary points when provided", () => {
      render(
        <SummaryPanel
          summaryPages={[{ points: ["Point one", "Point two"], timestamp: 1000 }]}
          transcriptSegments={[]}
          interimText={null}
        />,
      );

      expect(screen.getByText("Point one")).toBeDefined();
      expect(screen.getByText("Point two")).toBeDefined();
    });

    test("hides summary section when no pages", () => {
      render(<SummaryPanel summaryPages={[]} transcriptSegments={[]} interimText={null} />);

      expect(screen.queryByText("Summary")).toBeNull();
    });

    test("shows summary heading when pages exist", () => {
      render(
        <SummaryPanel
          summaryPages={[{ points: ["A point"], timestamp: 1000 }]}
          transcriptSegments={[]}
          interimText={null}
        />,
      );

      expect(screen.getByText("Summary")).toBeDefined();
    });
  });

  describe("layout structure", () => {
    test("has overflow-hidden on root for scroll containment", () => {
      const { container } = render(
        <SummaryPanel summaryPages={[]} transcriptSegments={[]} interimText={null} />,
      );

      const root = container.firstChild as HTMLElement;
      expect(root.className).toContain("overflow-hidden");
    });

    test("summary section has flex-shrink-0 to prevent shrinking", () => {
      const { container } = render(
        <SummaryPanel
          summaryPages={[{ points: ["A point"], timestamp: 1000 }]}
          transcriptSegments={[]}
          interimText={null}
        />,
      );

      // First div after root should be the summary section
      const root = container.firstChild as HTMLElement;
      const summarySection = root.firstChild as HTMLElement;
      expect(summarySection.className).toContain("flex-shrink-0");
    });

    test("transcript container has overflow-y-auto for scrolling", () => {
      render(<SummaryPanel summaryPages={[]} transcriptSegments={[]} interimText={null} />);

      const transcriptContainer = screen.getByText(
        "Start recording to see the transcript...",
      ).parentElement;
      expect(transcriptContainer?.className).toContain("overflow-y-auto");
    });
  });

  describe("skeleton loading state", () => {
    test("shows skeleton when analyzing and no summary pages", () => {
      render(
        <SummaryPanel
          summaryPages={[]}
          transcriptSegments={[]}
          interimText={null}
          isAnalyzing={true}
        />,
      );

      // Should show Summary heading with skeleton
      expect(screen.getByText("Summary")).toBeDefined();
    });

    test("shows summary points instead of skeleton when pages exist", () => {
      render(
        <SummaryPanel
          summaryPages={[{ points: ["Existing point"], timestamp: 1000 }]}
          transcriptSegments={[]}
          interimText={null}
          isAnalyzing={true}
        />,
      );

      expect(screen.getByText("Existing point")).toBeDefined();
    });
  });

  describe("pagination with multiple pages", () => {
    const createPages = (): SummaryPage[] => [
      { points: ["Page 1 Point A", "Page 1 Point B"], timestamp: 1000 },
      { points: ["Page 2 Point A", "Page 2 Point B"], timestamp: 2000 },
      { points: ["Page 3 Point A", "Page 3 Point B"], timestamp: 3000 },
    ];

    test("displays the latest page by default", () => {
      render(
        <SummaryPanel summaryPages={createPages()} transcriptSegments={[]} interimText={null} />,
      );

      expect(screen.getByText("Page 3 Point A")).toBeDefined();
      expect(screen.getByText("Page 3 Point B")).toBeDefined();
    });

    test("shows navigation controls when multiple pages exist", () => {
      render(
        <SummaryPanel summaryPages={createPages()} transcriptSegments={[]} interimText={null} />,
      );

      expect(screen.getByRole("button", { name: /previous/i })).toBeDefined();
      expect(screen.getByRole("button", { name: /next/i })).toBeDefined();
    });

    test("shows page counter", () => {
      render(
        <SummaryPanel summaryPages={createPages()} transcriptSegments={[]} interimText={null} />,
      );

      expect(screen.getByText("3/3")).toBeDefined();
    });

    test("navigates to previous page when clicking previous button", () => {
      render(
        <SummaryPanel summaryPages={createPages()} transcriptSegments={[]} interimText={null} />,
      );

      fireEvent.click(screen.getByRole("button", { name: /previous/i }));

      expect(screen.getByText("Page 2 Point A")).toBeDefined();
      expect(screen.getByText("2/3")).toBeDefined();
    });

    test("navigates to next page when clicking next button", () => {
      render(
        <SummaryPanel summaryPages={createPages()} transcriptSegments={[]} interimText={null} />,
      );

      // First go to previous to be able to test next
      fireEvent.click(screen.getByRole("button", { name: /previous/i }));
      fireEvent.click(screen.getByRole("button", { name: /next/i }));

      expect(screen.getByText("Page 3 Point A")).toBeDefined();
      expect(screen.getByText("3/3")).toBeDefined();
    });

    test("wraps around from first page to last page", () => {
      render(
        <SummaryPanel summaryPages={createPages()} transcriptSegments={[]} interimText={null} />,
      );

      // Go to first page
      fireEvent.click(screen.getByRole("button", { name: /previous/i }));
      fireEvent.click(screen.getByRole("button", { name: /previous/i }));
      expect(screen.getByText("1/3")).toBeDefined();

      // Wrap around to last
      fireEvent.click(screen.getByRole("button", { name: /previous/i }));
      expect(screen.getByText("Page 3 Point A")).toBeDefined();
      expect(screen.getByText("3/3")).toBeDefined();
    });

    test("wraps around from last page to first page", () => {
      render(
        <SummaryPanel summaryPages={createPages()} transcriptSegments={[]} interimText={null} />,
      );

      // Already on last page, go to next (wraps to first)
      fireEvent.click(screen.getByRole("button", { name: /next/i }));

      expect(screen.getByText("Page 1 Point A")).toBeDefined();
      expect(screen.getByText("1/3")).toBeDefined();
    });

    test("does not show navigation when only one page exists", () => {
      render(
        <SummaryPanel
          summaryPages={[{ points: ["Single Point"], timestamp: 1000 }]}
          transcriptSegments={[]}
          interimText={null}
        />,
      );

      expect(screen.queryByRole("button", { name: /previous/i })).toBeNull();
      expect(screen.queryByRole("button", { name: /next/i })).toBeNull();
      expect(screen.queryByText(/\d+\/\d+/)).toBeNull();
    });

    test("swipe left on summary area navigates to next page", () => {
      render(
        <SummaryPanel summaryPages={createPages()} transcriptSegments={[]} interimText={null} />,
      );

      const summaryPoint = screen.getByText("Page 3 Point A");
      fireEvent.touchStart(summaryPoint, {
        changedTouches: [{ clientX: 180, clientY: 100 }],
      });
      fireEvent.touchEnd(summaryPoint, {
        changedTouches: [{ clientX: 80, clientY: 100 }],
      });

      expect(screen.getByText("Page 1 Point A")).toBeDefined();
      expect(screen.getByText("1/3")).toBeDefined();
    });

    test("swipe right on summary area navigates to previous page", () => {
      render(
        <SummaryPanel summaryPages={createPages()} transcriptSegments={[]} interimText={null} />,
      );

      const summaryPoint = screen.getByText("Page 3 Point A");
      fireEvent.touchStart(summaryPoint, {
        changedTouches: [{ clientX: 80, clientY: 100 }],
      });
      fireEvent.touchEnd(summaryPoint, {
        changedTouches: [{ clientX: 180, clientY: 100 }],
      });

      expect(screen.getByText("Page 2 Point A")).toBeDefined();
      expect(screen.getByText("2/3")).toBeDefined();
    });

    test("does not navigate when swipe is mostly vertical", () => {
      render(
        <SummaryPanel summaryPages={createPages()} transcriptSegments={[]} interimText={null} />,
      );

      const summaryPoint = screen.getByText("Page 3 Point A");
      fireEvent.touchStart(summaryPoint, {
        changedTouches: [{ clientX: 120, clientY: 60 }],
      });
      fireEvent.touchEnd(summaryPoint, {
        changedTouches: [{ clientX: 80, clientY: 130 }],
      });

      expect(screen.getByText("Page 3 Point A")).toBeDefined();
      expect(screen.getByText("3/3")).toBeDefined();
    });
  });

  describe("auto-advance to latest page", () => {
    test("advances to newest page when new page is added", () => {
      const initialPages: SummaryPage[] = [
        { points: ["Page 1 Point"], timestamp: 1000 },
        { points: ["Page 2 Point"], timestamp: 2000 },
      ];

      const { rerender } = render(
        <SummaryPanel summaryPages={initialPages} transcriptSegments={[]} interimText={null} />,
      );

      expect(screen.getByText("Page 2 Point")).toBeDefined();
      expect(screen.getByText("2/2")).toBeDefined();

      // Add new page
      const updatedPages: SummaryPage[] = [
        ...initialPages,
        { points: ["Page 3 Point"], timestamp: 3000 },
      ];

      rerender(
        <SummaryPanel summaryPages={updatedPages} transcriptSegments={[]} interimText={null} />,
      );

      expect(screen.getByText("Page 3 Point")).toBeDefined();
      expect(screen.getByText("3/3")).toBeDefined();
    });
  });
});
