/**
 * Tests for SummaryPanel component.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/components/summary/SummaryPanel.tsx
 */

import { describe, test, expect, afterEach, mock } from "bun:test";
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

  describe("transcript display", () => {
    test("shows placeholder when no segments and no interim text", () => {
      render(
        <SummaryPanel
          summaryPages={[]}
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
          summaryPages={[]}
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
          summaryPages={[]}
          transcriptSegments={[]}
          interimText="typing in progress"
        />
      );

      const interimSpan = screen.getByText("typing in progress");
      expect(interimSpan).toBeDefined();
      expect(interimSpan.className).toContain("text-muted-foreground/50");
    });

    test("displays both final segments and interim text together", () => {
      const segments: TranscriptSegment[] = [
        { text: "Confirmed text", timestamp: 1000, isFinal: true },
      ];

      render(
        <SummaryPanel
          summaryPages={[]}
          transcriptSegments={segments}
          interimText="still typing"
        />
      );

      const finalSpan = screen.getByText("Confirmed text");
      const interimSpan = screen.getByText("still typing");

      expect(finalSpan).toBeDefined();
      expect(interimSpan).toBeDefined();
      expect(finalSpan.className).not.toContain("text-muted-foreground");
      expect(interimSpan.className).toContain("text-muted-foreground/50");
    });

    test("interim text has transition class for smooth color change", () => {
      render(
        <SummaryPanel
          summaryPages={[]}
          transcriptSegments={[]}
          interimText="transitioning"
        />
      );

      const interimSpan = screen.getByText("transitioning");
      expect(interimSpan.className).toContain("transition-colors");
    });
  });

  describe("summary pages", () => {
    test("displays summary points when provided", () => {
      render(
        <SummaryPanel
          summaryPages={[{ points: ["Point one", "Point two"], timestamp: 1000 }]}
          transcriptSegments={[]}
          interimText={null}
        />
      );

      expect(screen.getByText("Point one")).toBeDefined();
      expect(screen.getByText("Point two")).toBeDefined();
    });

    test("hides summary section when no pages", () => {
      render(
        <SummaryPanel
          summaryPages={[]}
          transcriptSegments={[]}
          interimText={null}
        />
      );

      expect(screen.queryByText("Summary")).toBeNull();
    });

    test("shows summary heading when pages exist", () => {
      render(
        <SummaryPanel
          summaryPages={[{ points: ["A point"], timestamp: 1000 }]}
          transcriptSegments={[]}
          interimText={null}
        />
      );

      expect(screen.getByText("Summary")).toBeDefined();
    });
  });

  describe("layout structure", () => {
    test("has overflow-hidden on root for scroll containment", () => {
      const { container } = render(
        <SummaryPanel
          summaryPages={[]}
          transcriptSegments={[]}
          interimText={null}
        />
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
        />
      );

      // First div after root should be the summary section
      const root = container.firstChild as HTMLElement;
      const summarySection = root.firstChild as HTMLElement;
      expect(summarySection.className).toContain("flex-shrink-0");
    });

    test("transcript container has overflow-y-auto for scrolling", () => {
      render(
        <SummaryPanel
          summaryPages={[]}
          transcriptSegments={[]}
          interimText={null}
        />
      );

      const transcriptContainer = screen
        .getByText("Start recording to see the transcript...")
        .parentElement;
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
        />
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
        />
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
        <SummaryPanel
          summaryPages={createPages()}
          transcriptSegments={[]}
          interimText={null}
        />
      );

      expect(screen.getByText("Page 3 Point A")).toBeDefined();
      expect(screen.getByText("Page 3 Point B")).toBeDefined();
    });

    test("shows navigation controls when multiple pages exist", () => {
      render(
        <SummaryPanel
          summaryPages={createPages()}
          transcriptSegments={[]}
          interimText={null}
        />
      );

      expect(screen.getByRole("button", { name: /previous/i })).toBeDefined();
      expect(screen.getByRole("button", { name: /next/i })).toBeDefined();
    });

    test("shows page counter", () => {
      render(
        <SummaryPanel
          summaryPages={createPages()}
          transcriptSegments={[]}
          interimText={null}
        />
      );

      expect(screen.getByText("3 / 3")).toBeDefined();
    });

    test("navigates to previous page when clicking previous button", () => {
      render(
        <SummaryPanel
          summaryPages={createPages()}
          transcriptSegments={[]}
          interimText={null}
        />
      );

      fireEvent.click(screen.getByRole("button", { name: /previous/i }));

      expect(screen.getByText("Page 2 Point A")).toBeDefined();
      expect(screen.getByText("2 / 3")).toBeDefined();
    });

    test("navigates to next page when clicking next button", () => {
      render(
        <SummaryPanel
          summaryPages={createPages()}
          transcriptSegments={[]}
          interimText={null}
        />
      );

      // First go to previous to be able to test next
      fireEvent.click(screen.getByRole("button", { name: /previous/i }));
      fireEvent.click(screen.getByRole("button", { name: /next/i }));

      expect(screen.getByText("Page 3 Point A")).toBeDefined();
      expect(screen.getByText("3 / 3")).toBeDefined();
    });

    test("wraps around from first page to last page", () => {
      render(
        <SummaryPanel
          summaryPages={createPages()}
          transcriptSegments={[]}
          interimText={null}
        />
      );

      // Go to first page
      fireEvent.click(screen.getByRole("button", { name: /previous/i }));
      fireEvent.click(screen.getByRole("button", { name: /previous/i }));
      expect(screen.getByText("1 / 3")).toBeDefined();

      // Wrap around to last
      fireEvent.click(screen.getByRole("button", { name: /previous/i }));
      expect(screen.getByText("Page 3 Point A")).toBeDefined();
      expect(screen.getByText("3 / 3")).toBeDefined();
    });

    test("wraps around from last page to first page", () => {
      render(
        <SummaryPanel
          summaryPages={createPages()}
          transcriptSegments={[]}
          interimText={null}
        />
      );

      // Already on last page, go to next (wraps to first)
      fireEvent.click(screen.getByRole("button", { name: /next/i }));

      expect(screen.getByText("Page 1 Point A")).toBeDefined();
      expect(screen.getByText("1 / 3")).toBeDefined();
    });

    test("does not show navigation when only one page exists", () => {
      render(
        <SummaryPanel
          summaryPages={[{ points: ["Single Point"], timestamp: 1000 }]}
          transcriptSegments={[]}
          interimText={null}
        />
      );

      expect(screen.queryByRole("button", { name: /previous/i })).toBeNull();
      expect(screen.queryByRole("button", { name: /next/i })).toBeNull();
      expect(screen.queryByText(/\d+ \/ \d+/)).toBeNull();
    });
  });

  describe("auto-advance to latest page", () => {
    test("advances to newest page when new page is added", () => {
      const initialPages: SummaryPage[] = [
        { points: ["Page 1 Point"], timestamp: 1000 },
        { points: ["Page 2 Point"], timestamp: 2000 },
      ];

      const { rerender } = render(
        <SummaryPanel
          summaryPages={initialPages}
          transcriptSegments={[]}
          interimText={null}
        />
      );

      expect(screen.getByText("Page 2 Point")).toBeDefined();
      expect(screen.getByText("2 / 2")).toBeDefined();

      // Add new page
      const updatedPages: SummaryPage[] = [
        ...initialPages,
        { points: ["Page 3 Point"], timestamp: 3000 },
      ];

      rerender(
        <SummaryPanel
          summaryPages={updatedPages}
          transcriptSegments={[]}
          interimText={null}
        />
      );

      expect(screen.getByText("Page 3 Point")).toBeDefined();
      expect(screen.getByText("3 / 3")).toBeDefined();
    });
  });
});
