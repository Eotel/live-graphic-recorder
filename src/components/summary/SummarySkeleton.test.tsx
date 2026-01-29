/**
 * Tests for SummarySkeleton component.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/components/summary/SummarySkeleton.tsx
 */

import { describe, test, expect, afterEach } from "bun:test";
import { render, screen, cleanup } from "@testing-library/react";
import { SummarySkeleton } from "./SummarySkeleton";

describe("SummarySkeleton", () => {
  afterEach(() => {
    cleanup();
  });

  test("renders analyzing status text", () => {
    render(<SummarySkeleton />);

    expect(screen.getByText("Analyzing...")).toBeDefined();
  });

  test("renders spinner icon", () => {
    const { container } = render(<SummarySkeleton />);

    // Loader2 icon should have animate-spin class
    const spinner = container.querySelector(".animate-spin");
    expect(spinner).not.toBeNull();
  });

  test("renders skeleton bullet points", () => {
    const { container } = render(<SummarySkeleton />);

    // Should render 3 skeleton bullet points
    const skeletons = container.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBe(3);
  });

  test("applies custom className", () => {
    const { container } = render(<SummarySkeleton className="custom-class" />);

    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement.className).toContain("custom-class");
  });
});
