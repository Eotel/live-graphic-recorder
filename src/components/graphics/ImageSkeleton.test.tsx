/**
 * Tests for ImageSkeleton component.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/components/graphics/ImageSkeleton.tsx
 */

import { describe, test, expect, afterEach } from "bun:test";
import { render, screen, cleanup } from "@testing-library/react";
import { ImageSkeleton } from "./ImageSkeleton";

describe("ImageSkeleton", () => {
  afterEach(() => {
    cleanup();
  });

  test("renders generating status text by default", () => {
    render(<ImageSkeleton />);

    expect(screen.getByText("Generating image...")).toBeDefined();
  });

  test("renders retrying status text when isRetrying is true", () => {
    render(<ImageSkeleton isRetrying />);

    expect(screen.getByText("Retrying...")).toBeDefined();
  });

  test("renders spinner icon", () => {
    const { container } = render(<ImageSkeleton />);

    // Loader2 icon should have animate-spin class
    const spinner = container.querySelector(".animate-spin");
    expect(spinner).not.toBeNull();
  });

  test("renders image icon", () => {
    const { container } = render(<ImageSkeleton />);

    // Should have an svg (ImageIcon)
    const icon = container.querySelector("svg");
    expect(icon).not.toBeNull();
  });

  test("has aspect-video container", () => {
    const { container } = render(<ImageSkeleton />);

    const aspectContainer = container.querySelector(".aspect-video");
    expect(aspectContainer).not.toBeNull();
  });

  test("applies custom className", () => {
    const { container } = render(<ImageSkeleton className="custom-class" />);

    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement.className).toContain("custom-class");
  });

  test("has shimmer animation overlay", () => {
    const { container } = render(<ImageSkeleton />);

    const shimmer = container.querySelector(".animate-shimmer");
    expect(shimmer).not.toBeNull();
  });
});
