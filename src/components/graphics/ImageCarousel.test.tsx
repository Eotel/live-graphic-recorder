/**
 * Tests for ImageCarousel component.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/components/graphics/ImageCarousel.tsx
 */

import { describe, test, expect, afterEach } from "bun:test";
import { render, screen, cleanup } from "@testing-library/react";
import { ImageCarousel } from "./ImageCarousel";

describe("ImageCarousel", () => {
  afterEach(() => {
    cleanup();
  });

  test("shows navigation buttons with accessible names when multiple images exist", () => {
    render(
      <ImageCarousel
        images={[
          { url: "https://example.com/1.png", prompt: "First image", timestamp: 1000 },
          { url: "https://example.com/2.png", prompt: "Second image", timestamp: 2000 },
        ]}
      />,
    );

    expect(screen.getByRole("button", { name: /previous image/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /next image/i })).toBeDefined();
  });

  test("hides navigation buttons when only one image exists", () => {
    render(
      <ImageCarousel
        images={[{ url: "https://example.com/1.png", prompt: "Only image", timestamp: 1000 }]}
      />,
    );

    expect(screen.queryByRole("button", { name: /previous image/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /next image/i })).toBeNull();
  });
});
