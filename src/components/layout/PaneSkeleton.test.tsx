/**
 * Tests for PaneSkeleton component.
 *
 * Related: src/components/layout/PaneSkeleton.tsx, src/components/layout/PopoutPane.tsx
 */

import { describe, test, expect, mock, afterEach } from "bun:test";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { PaneSkeleton } from "./PaneSkeleton";

describe("PaneSkeleton", () => {
  afterEach(() => {
    cleanup();
  });

  test("renders label text indicating pane is in a separate window", () => {
    render(<PaneSkeleton paneId="camera" label="Camera" />);

    expect(screen.getByText(/Camera/)).toBeTruthy();
    expect(screen.getByText(/separate window/i)).toBeTruthy();
  });

  test("calls onFocus when clicked", () => {
    const onFocus = mock(() => {});
    render(<PaneSkeleton paneId="camera" label="Camera" onFocus={onFocus} />);

    const skeleton = screen.getByRole("button");
    fireEvent.click(skeleton);

    expect(onFocus).toHaveBeenCalledTimes(1);
  });

  test("renders without onFocus handler (not clickable)", () => {
    render(<PaneSkeleton paneId="camera" label="Camera" />);

    // Should still render without error
    expect(screen.getByText(/Camera/)).toBeTruthy();
  });

  test("applies custom className", () => {
    const { container } = render(
      <PaneSkeleton paneId="summary" label="Summary" className="custom-class" />,
    );

    expect(container.firstElementChild?.classList.contains("custom-class")).toBe(true);
  });
});
