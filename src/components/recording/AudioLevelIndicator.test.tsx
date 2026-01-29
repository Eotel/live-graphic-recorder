/**
 * Tests for AudioLevelIndicator component.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/components/recording/AudioLevelIndicator.tsx, src/hooks/useAudioLevel.ts
 */

import { describe, test, expect, afterEach } from "bun:test";
import { render, screen, cleanup } from "@testing-library/react";
import { AudioLevelIndicator } from "./AudioLevelIndicator";

afterEach(() => {
  cleanup();
});

describe("AudioLevelIndicator", () => {
  test("renders mic icon", () => {
    render(<AudioLevelIndicator isActive={false} />);
    const icon = screen.getByTestId("mic-icon");
    expect(icon).toBeDefined();
  });

  test("applies muted-foreground color when inactive", () => {
    const { container } = render(<AudioLevelIndicator isActive={false} />);
    const icon = container.querySelector("[data-testid='mic-icon']");
    expect(icon?.className).toContain("text-muted-foreground");
  });

  test("applies green color when active", () => {
    const { container } = render(<AudioLevelIndicator isActive={true} />);
    const icon = container.querySelector("[data-testid='mic-icon']");
    expect(icon?.className).toContain("text-green-500");
  });

  test("shows pulse ring when active", () => {
    const { container } = render(<AudioLevelIndicator isActive={true} />);
    const pulseRing = container.querySelector("[data-testid='pulse-ring']");
    expect(pulseRing).toBeDefined();
  });

  test("does not show pulse ring when inactive", () => {
    const { container } = render(<AudioLevelIndicator isActive={false} />);
    const pulseRing = container.querySelector("[data-testid='pulse-ring']");
    expect(pulseRing).toBeNull();
  });

  test("accepts custom className", () => {
    const { container } = render(
      <AudioLevelIndicator isActive={false} className="custom-class" />
    );
    const wrapper = container.firstChild;
    expect((wrapper as HTMLElement)?.className).toContain("custom-class");
  });

  test("renders with correct size", () => {
    const { container } = render(<AudioLevelIndicator isActive={false} />);
    const icon = container.querySelector("[data-testid='mic-icon']");
    expect(icon?.className).toContain("h-4");
    expect(icon?.className).toContain("w-4");
  });
});
