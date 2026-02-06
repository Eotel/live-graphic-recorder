/**
 * Tests for PaneToolbar component.
 *
 * Related: src/components/layout/PaneToolbar.tsx
 */

import { describe, test, expect, mock, afterEach } from "bun:test";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { PaneToolbar } from "./PaneToolbar";

afterEach(cleanup);

describe("PaneToolbar", () => {
  const defaultProps = {
    paneId: "summary" as const,
    mode: "normal" as const,
    onExpand: mock(() => {}),
    onCollapse: mock(() => {}),
    onPopout: mock(() => {}),
  };

  test("renders expand and popout buttons in normal mode", () => {
    render(<PaneToolbar {...defaultProps} mode="normal" />);

    expect(screen.getByRole("button", { name: /expand/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /pop\s*out/i })).toBeTruthy();
  });

  test("renders collapse button in expanded mode", () => {
    render(<PaneToolbar {...defaultProps} mode="expanded" />);

    expect(screen.getByRole("button", { name: /collapse/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /expand/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /pop\s*out/i })).toBeNull();
  });

  test("renders nothing meaningful in popout mode", () => {
    const { container } = render(<PaneToolbar {...defaultProps} mode="popout" />);

    expect(screen.queryByRole("button")).toBeNull();
    // Container should be empty or have an empty div
    expect(container.querySelector("button")).toBeNull();
  });

  test("calls onExpand when expand button is clicked", () => {
    const onExpand = mock(() => {});
    render(<PaneToolbar {...defaultProps} mode="normal" onExpand={onExpand} />);

    fireEvent.click(screen.getByRole("button", { name: /expand/i }));

    expect(onExpand).toHaveBeenCalledTimes(1);
  });

  test("calls onCollapse when collapse button is clicked", () => {
    const onCollapse = mock(() => {});
    render(<PaneToolbar {...defaultProps} mode="expanded" onCollapse={onCollapse} />);

    fireEvent.click(screen.getByRole("button", { name: /collapse/i }));

    expect(onCollapse).toHaveBeenCalledTimes(1);
  });

  test("calls onPopout when popout button is clicked", () => {
    const onPopout = mock(() => {});
    render(<PaneToolbar {...defaultProps} mode="normal" onPopout={onPopout} />);

    fireEvent.click(screen.getByRole("button", { name: /pop\s*out/i }));

    expect(onPopout).toHaveBeenCalledTimes(1);
  });
});
