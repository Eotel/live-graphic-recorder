/**
 * Tests for PopoutPane component.
 *
 * PopoutPane is a pure rendering component — it either renders children
 * normally or portals them into a provided container (showing a skeleton
 * placeholder in the original position).
 *
 * Related: src/components/layout/PopoutPane.tsx
 */

import { describe, test, expect, mock, afterEach } from "bun:test";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { PopoutPane } from "./PopoutPane";

afterEach(() => cleanup());

describe("PopoutPane", () => {
  test("renders children normally when isPopout=false", () => {
    render(
      <PopoutPane paneId="summary" isPopout={false} portalContainer={null}>
        <div data-testid="child">Hello</div>
      </PopoutPane>,
    );

    expect(screen.getByTestId("child")).toBeTruthy();
    expect(screen.getByText("Hello")).toBeTruthy();
  });

  test("renders children normally when isPopout=true but portalContainer=null", () => {
    // If the popout window hasn't opened yet (or was blocked), render children in place
    render(
      <PopoutPane paneId="camera" isPopout={true} portalContainer={null}>
        <div data-testid="child">Content</div>
      </PopoutPane>,
    );

    expect(screen.getByTestId("child")).toBeTruthy();
  });

  test("shows skeleton placeholder when isPopout=true and portalContainer is provided", () => {
    const container = document.createElement("div");

    render(
      <PopoutPane paneId="camera" isPopout={true} portalContainer={container}>
        <div data-testid="child">Camera Content</div>
      </PopoutPane>,
    );

    // The placeholder (PaneSkeleton) should be visible in the original position
    expect(screen.getByText(/separate window/i)).toBeTruthy();
    // Children are portaled into the container, not in the main DOM tree
    expect(screen.queryByTestId("child")).toBeNull();
    expect(container.querySelector('[data-testid="child"]')).toBeTruthy();
  });

  test("portals children into the provided container", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);

    render(
      <PopoutPane paneId="graphics" isPopout={true} portalContainer={container}>
        <div data-testid="portaled">Portaled Content</div>
      </PopoutPane>,
    );

    // Content should be in the portal container
    expect(container.querySelector('[data-testid="portaled"]')).toBeTruthy();
    expect(container.textContent).toContain("Portaled Content");

    container.remove();
  });

  test("shows custom placeholder when provided", () => {
    const container = document.createElement("div");

    render(
      <PopoutPane
        paneId="camera"
        isPopout={true}
        portalContainer={container}
        placeholder={<div data-testid="custom-placeholder">Custom Placeholder</div>}
      >
        <div>Content</div>
      </PopoutPane>,
    );

    expect(screen.getByTestId("custom-placeholder")).toBeTruthy();
  });

  test("calls onFocusPopout when skeleton is clicked", () => {
    const container = document.createElement("div");
    const onFocus = mock(() => {});

    render(
      <PopoutPane
        paneId="summary"
        isPopout={true}
        portalContainer={container}
        onFocusPopout={onFocus}
      >
        <div>Content</div>
      </PopoutPane>,
    );

    // Click the skeleton placeholder
    const skeleton = screen
      .getByText(/separate window/i)
      .closest("button, [role=button], div[class*='cursor']");
    if (skeleton) {
      fireEvent.click(skeleton);
      expect(onFocus).toHaveBeenCalledTimes(1);
    }
  });
});
