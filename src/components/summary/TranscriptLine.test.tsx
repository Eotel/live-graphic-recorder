/**
 * Tests for TranscriptLine component.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/components/summary/TranscriptLine.tsx
 */

import { describe, test, expect, afterEach } from "bun:test";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { TranscriptLine } from "./TranscriptLine";

describe("TranscriptLine", () => {
  afterEach(() => {
    cleanup();
  });

  describe("basic rendering", () => {
    test("renders text content", () => {
      render(<TranscriptLine text="Hello world" />);
      expect(screen.getByText("Hello world")).toBeDefined();
    });

    test("renders without speaker or time info", () => {
      render(<TranscriptLine text="Plain text" />);
      expect(screen.getByText("Plain text")).toBeDefined();
      expect(screen.queryByText(/Speaker/)).toBeNull();
    });
  });

  describe("speaker display", () => {
    test("displays speaker label when speaker is provided", () => {
      render(<TranscriptLine text="Hello" speaker={0} />);
      expect(screen.getByText("Speaker 1:")).toBeDefined();
    });

    test("displays correct speaker number (1-indexed)", () => {
      render(<TranscriptLine text="Hello" speaker={2} />);
      expect(screen.getByText("Speaker 3:")).toBeDefined();
    });

    test("displays alias when speaker alias exists", () => {
      render(<TranscriptLine text="Hello" speaker={1} speakerAliases={{ 1: "田中" }} />);
      expect(screen.getByText("田中:")).toBeDefined();
    });

    test("applies color class to speaker label", () => {
      render(<TranscriptLine text="Hello" speaker={0} />);
      const speakerLabel = screen.getByText("Speaker 1:");
      expect(speakerLabel.className).toContain("text-blue-600");
    });

    test("different speakers get different colors", () => {
      const { rerender } = render(<TranscriptLine text="Hello" speaker={0} />);
      const speaker1 = screen.getByText("Speaker 1:");
      const speaker1Color = speaker1.className;

      rerender(<TranscriptLine text="Hello" speaker={1} />);
      const speaker2 = screen.getByText("Speaker 2:");
      const speaker2Color = speaker2.className;

      expect(speaker1Color).not.toBe(speaker2Color);
    });

    test("colors rotate for speakers > 8", () => {
      render(<TranscriptLine text="Hello" speaker={8} />);
      const speakerLabel = screen.getByText("Speaker 9:");
      // Speaker 8 (index 8 % 8 = 0) should have same color as speaker 0
      expect(speakerLabel.className).toContain("text-blue-600");
    });

    test("allows inline speaker label edit and commits on Enter", () => {
      const onSpeakerLabelEdit = (speaker: number, name: string) => edits.push({ speaker, name });
      const edits: Array<{ speaker: number; name: string }> = [];

      render(<TranscriptLine text="Hello" speaker={0} onSpeakerLabelEdit={onSpeakerLabelEdit} />);

      fireEvent.click(screen.getByRole("button", { name: "Edit speaker 1 label" }));
      const input = screen.getByRole("textbox", { name: "Edit speaker 1 label" });
      fireEvent.change(input, { target: { value: "山田" } });
      fireEvent.keyDown(input, { key: "Enter" });

      expect(edits).toEqual([{ speaker: 0, name: "山田" }]);
    });

    test("submits empty name as alias removal", () => {
      const onSpeakerLabelEdit = (speaker: number, name: string) => edits.push({ speaker, name });
      const edits: Array<{ speaker: number; name: string }> = [];

      render(
        <TranscriptLine
          text="Hello"
          speaker={0}
          speakerAliases={{ 0: "既存名" }}
          onSpeakerLabelEdit={onSpeakerLabelEdit}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "Edit speaker 1 label" }));
      const input = screen.getByRole("textbox", { name: "Edit speaker 1 label" });
      fireEvent.change(input, { target: { value: "   " } });
      fireEvent.keyDown(input, { key: "Enter" });

      expect(edits).toEqual([{ speaker: 0, name: "" }]);
    });
  });

  describe("timestamp display", () => {
    test("displays formatted time when startTime is provided", () => {
      render(<TranscriptLine text="Hello" startTime={65} />);
      expect(screen.getByText("1:05")).toBeDefined();
    });

    test("formats zero seconds correctly", () => {
      render(<TranscriptLine text="Hello" startTime={0} />);
      expect(screen.getByText("0:00")).toBeDefined();
    });

    test("does not display time when startTime is not provided", () => {
      render(<TranscriptLine text="Hello" />);
      expect(screen.queryByText(/^\d+:\d{2}$/)).toBeNull();
    });
  });

  describe("interim styling", () => {
    test("applies muted styling when isInterim is true", () => {
      const { container } = render(<TranscriptLine text="Typing..." isInterim={true} />);
      const root = container.firstChild as HTMLElement;
      expect(root.className).toContain("text-muted-foreground/50");
    });

    test("applies italic to text when isInterim is true", () => {
      render(<TranscriptLine text="Typing..." isInterim={true} />);
      const textSpan = screen.getByText("Typing...");
      expect(textSpan.className).toContain("italic");
    });

    test("does not apply interim styling when isInterim is false", () => {
      const { container } = render(<TranscriptLine text="Final text" isInterim={false} />);
      const root = container.firstChild as HTMLElement;
      expect(root.className).not.toContain("text-muted-foreground/50");
    });
  });

  describe("combined display", () => {
    test("renders all elements together", () => {
      render(<TranscriptLine text="Hello everyone" speaker={1} startTime={90} isInterim={false} />);

      expect(screen.getByText("1:30")).toBeDefined();
      expect(screen.getByText("Speaker 2:")).toBeDefined();
      expect(screen.getByText("Hello everyone")).toBeDefined();
    });
  });

  describe("className prop", () => {
    test("applies custom className", () => {
      const { container } = render(<TranscriptLine text="Hello" className="custom-class" />);
      const root = container.firstChild as HTMLElement;
      expect(root.className).toContain("custom-class");
    });
  });
});
