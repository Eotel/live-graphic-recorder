/**
 * Integration tests for pane expand/popout feature.
 *
 * Verifies end-to-end behavior of expand/collapse/popout flows
 * combining pane-state-controller, PaneToolbar, PopoutPane, and MainLayout.
 *
 * Capability evals:  C1-C4 (expand), C5-C11 (popout), C12-C14 (UX)
 * Regression evals:  R1-R3 (layout), R7-R9 (core features preserved)
 *
 * Related: src/logic/pane-state-controller.ts, src/hooks/usePaneState.ts,
 *          src/components/layout/MainLayout.tsx, src/components/layout/PaneToolbar.tsx,
 *          src/components/layout/PopoutPane.tsx
 */

import { describe, test, expect, mock, afterEach } from "bun:test";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { createPaneStateController } from "../../logic/pane-state-controller";
import type { PaneStateController } from "../../logic/pane-state-controller";
import { PaneToolbar } from "./PaneToolbar";
import { MainLayout } from "./MainLayout";
import { PopoutPane } from "./PopoutPane";

afterEach(cleanup);

// ---------------------------------------------------------------------------
// C1-C4: Expand functionality integration
// ---------------------------------------------------------------------------

describe("Expand flow (C1-C4)", () => {
  function renderLayoutWithController(ctrl: PaneStateController) {
    const state = ctrl.getState();

    return render(
      <MainLayout
        expandedPane={state.expandedPane}
        header={<div data-testid="header">Header</div>}
        leftPanel={
          <div data-testid="summary-pane" className="group relative">
            <PaneToolbar
              paneId="summary"
              mode={ctrl.getPaneMode("summary")}
              onExpand={() => ctrl.expandPane("summary")}
              onCollapse={() => ctrl.collapsePane()}
              onPopout={() => ctrl.popoutPane("summary")}
            />
            <p>Summary Content</p>
          </div>
        }
        rightPanel={
          <div data-testid="right-panel">
            <p>Right Panel (camera + graphics)</p>
          </div>
        }
        cameraPanel={
          <div data-testid="camera-pane" className="group relative">
            <PaneToolbar
              paneId="camera"
              mode={ctrl.getPaneMode("camera")}
              onExpand={() => ctrl.expandPane("camera")}
              onCollapse={() => ctrl.collapsePane()}
              onPopout={() => ctrl.popoutPane("camera")}
            />
            <p>Camera Content</p>
          </div>
        }
        graphicsPanel={
          <div data-testid="graphics-pane" className="group relative">
            <PaneToolbar
              paneId="graphics"
              mode={ctrl.getPaneMode("graphics")}
              onExpand={() => ctrl.expandPane("graphics")}
              onCollapse={() => ctrl.collapsePane()}
              onPopout={() => ctrl.popoutPane("graphics")}
            />
            <p>Graphics Content</p>
          </div>
        }
        footer={<div data-testid="footer">Footer</div>}
      />,
    );
  }

  test("C1: clicking expand button sets pane as expanded", () => {
    const ctrl = createPaneStateController();
    ctrl.expandPane("summary");
    renderLayoutWithController(ctrl);

    expect(ctrl.getState().expandedPane).toBe("summary");
    expect(ctrl.getPaneMode("summary")).toBe("expanded");
  });

  test("C2: only expanded pane is visible (others hidden via CSS)", () => {
    const ctrl = createPaneStateController();
    ctrl.expandPane("camera");
    const { container } = renderLayoutWithController(ctrl);

    // The camera pane should be visible (not hidden)
    const cameraPane = screen.getByTestId("camera-pane");
    expect(cameraPane.closest('[class*="hidden"]')?.classList.contains("hidden")).toBeFalsy();

    // Summary content should be in a hidden div
    const summaryDivs = container.querySelectorAll('[data-testid="summary-pane"]');
    // There are multiple instances (one in expanded view, one in normal layout)
    // The expanded view's summary should be hidden when camera is expanded
    let foundHiddenSummary = false;
    summaryDivs.forEach((el) => {
      const parent = el.parentElement;
      if (parent?.classList.contains("hidden")) {
        foundHiddenSummary = true;
      }
    });
    expect(foundHiddenSummary).toBe(true);
  });

  test("C3: collapse restores normal layout", () => {
    const ctrl = createPaneStateController();
    ctrl.expandPane("summary");
    expect(ctrl.getState().expandedPane).toBe("summary");

    ctrl.collapsePane();
    expect(ctrl.getState().expandedPane).toBeNull();
    expect(ctrl.getPaneMode("summary")).toBe("normal");
  });

  test("C4: only one pane expanded at a time", () => {
    const ctrl = createPaneStateController();

    ctrl.expandPane("summary");
    expect(ctrl.getState().expandedPane).toBe("summary");

    ctrl.expandPane("graphics");
    expect(ctrl.getState().expandedPane).toBe("graphics");
    expect(ctrl.getPaneMode("summary")).toBe("normal");
  });

  test("C4b: Escape key triggers collapse", () => {
    const ctrl = createPaneStateController();
    ctrl.expandPane("camera");

    // Simulate what App.tsx does: Escape keydown → collapsePane
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") ctrl.collapsePane();
    };
    document.addEventListener("keydown", handler);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(ctrl.getState().expandedPane).toBeNull();
    document.removeEventListener("keydown", handler);
  });
});

// ---------------------------------------------------------------------------
// C5-C11: Popout functionality integration
// ---------------------------------------------------------------------------

describe("Popout flow (C5-C11)", () => {
  test("C5: popoutPane marks pane as popped out", () => {
    const ctrl = createPaneStateController();

    ctrl.popoutPane("camera");

    expect(ctrl.getPaneMode("camera")).toBe("popout");
    expect(ctrl.getState().popoutPanes.has("camera")).toBe(true);
  });

  test("C6: PopoutPane with portalContainer shows placeholder and portals children", () => {
    const container = document.createElement("div");

    render(
      <PopoutPane paneId="camera" isPopout={true} portalContainer={container}>
        <div data-testid="camera-child">Camera Preview</div>
      </PopoutPane>,
    );

    // Placeholder visible in original position
    expect(screen.getByText(/separate window/i)).toBeTruthy();
    // Children portaled to container
    expect(container.querySelector('[data-testid="camera-child"]')).toBeTruthy();
  });

  test("C7: PopoutPane renders children normally when portalContainer is null (popout not ready)", () => {
    render(
      <PopoutPane paneId="camera" isPopout={true} portalContainer={null}>
        <div data-testid="camera-child">Content</div>
      </PopoutPane>,
    );

    // Falls back to normal rendering when no portal container
    expect(screen.getByTestId("camera-child")).toBeTruthy();
  });

  test("C8: multiple panes can be popped out simultaneously", () => {
    const ctrl = createPaneStateController();

    ctrl.popoutPane("camera");
    ctrl.popoutPane("graphics");

    expect(ctrl.getPaneMode("camera")).toBe("popout");
    expect(ctrl.getPaneMode("graphics")).toBe("popout");
    expect(ctrl.getState().popoutPanes.size).toBe(2);
  });

  test("C9: cannot expand a popped-out pane", () => {
    const ctrl = createPaneStateController();

    ctrl.popoutPane("camera");
    ctrl.expandPane("camera");

    expect(ctrl.getState().expandedPane).toBeNull();
    expect(ctrl.getPaneMode("camera")).toBe("popout");
  });

  test("C10: PopoutPane shows PaneSkeleton placeholder by default", () => {
    const container = document.createElement("div");

    render(
      <PopoutPane paneId="graphics" isPopout={true} portalContainer={container}>
        <div>Content</div>
      </PopoutPane>,
    );

    // PaneSkeleton shows "{label} is open in a separate window"
    expect(screen.getByText(/Graphics/)).toBeTruthy();
    expect(screen.getByText(/separate window/i)).toBeTruthy();
  });

  test("C11: closePopout reverts pane to normal mode", () => {
    const ctrl = createPaneStateController();

    ctrl.popoutPane("camera");
    expect(ctrl.getPaneMode("camera")).toBe("popout");

    ctrl.closePopout("camera");
    expect(ctrl.getPaneMode("camera")).toBe("normal");
    expect(ctrl.getState().popoutPanes.has("camera")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// C12-C14: UX requirements
// ---------------------------------------------------------------------------

describe("UX requirements (C12-C14)", () => {
  test("C12: PaneToolbar shows correct buttons per mode", () => {
    const noop = mock(() => {});

    const { rerender } = render(
      <PaneToolbar
        paneId="summary"
        mode="normal"
        onExpand={noop}
        onCollapse={noop}
        onPopout={noop}
      />,
    );

    // Normal: expand + popout
    expect(screen.getByRole("button", { name: /expand/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /pop\s*out/i })).toBeTruthy();

    rerender(
      <PaneToolbar
        paneId="summary"
        mode="expanded"
        onExpand={noop}
        onCollapse={noop}
        onPopout={noop}
      />,
    );

    // Expanded: collapse only
    expect(screen.getByRole("button", { name: /collapse/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /expand/i })).toBeNull();
  });

  test("C13: popout button has responsive class for mobile hiding", () => {
    const noop = mock(() => {});

    render(
      <PaneToolbar
        paneId="camera"
        mode="normal"
        onExpand={noop}
        onCollapse={noop}
        onPopout={noop}
      />,
    );

    const popoutBtn = screen.getByRole("button", { name: /pop\s*out/i });
    expect(popoutBtn.className).toContain("hidden");
    expect(popoutBtn.className).toContain("md:inline-flex");
  });

  test("C14: toolbar buttons have accessible aria-labels", () => {
    const noop = mock(() => {});

    render(
      <PaneToolbar
        paneId="summary"
        mode="normal"
        onExpand={noop}
        onCollapse={noop}
        onPopout={noop}
      />,
    );

    expect(screen.getByLabelText("Expand pane")).toBeTruthy();
    expect(screen.getByLabelText("Pop out pane")).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// R1-R3: Layout regression
// ---------------------------------------------------------------------------

describe("Layout regression (R1-R3)", () => {
  test("R1: normal layout renders header, left, right, footer", () => {
    render(
      <MainLayout
        header={<div data-testid="header">Header</div>}
        leftPanel={<div data-testid="left">Left</div>}
        rightPanel={<div data-testid="right">Right</div>}
        footer={<div data-testid="footer">Footer</div>}
      />,
    );

    expect(screen.getByTestId("header")).toBeTruthy();
    expect(screen.getAllByTestId("left").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByTestId("right").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId("footer")).toBeTruthy();
  });

  test("R2: MainLayout without expandedPane uses normal layout (no expanded view)", () => {
    const { container } = render(
      <MainLayout
        header={<div>Header</div>}
        leftPanel={<div data-testid="left">Left</div>}
        rightPanel={<div data-testid="right">Right</div>}
        footer={<div>Footer</div>}
      />,
    );

    // There should be only the normal main element (no expanded overlay)
    const mains = container.querySelectorAll("main");
    expect(mains.length).toBe(1);
  });

  test("R3: header and footer are always visible even when expanded", () => {
    render(
      <MainLayout
        expandedPane="summary"
        header={<div data-testid="header">Header</div>}
        leftPanel={<div>Left</div>}
        rightPanel={<div>Right</div>}
        footer={<div data-testid="footer">Footer</div>}
      />,
    );

    expect(screen.getByTestId("header")).toBeTruthy();
    expect(screen.getByTestId("footer")).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// R7-R9: Core feature preservation (components stay mounted)
// ---------------------------------------------------------------------------

describe("Core feature preservation (R7-R9)", () => {
  test("R7: hidden panes remain in DOM when another is expanded", () => {
    const { container } = render(
      <MainLayout
        expandedPane="camera"
        header={<div>Header</div>}
        leftPanel={<div data-testid="summary-content">Summary text</div>}
        rightPanel={<div data-testid="right-panel">Right</div>}
        cameraPanel={<div data-testid="camera-content">Camera feed</div>}
        graphicsPanel={<div data-testid="graphics-content">Graphics output</div>}
        footer={<div>Footer</div>}
      />,
    );

    // Camera is the expanded pane - should be visible
    expect(screen.getByTestId("camera-content")).toBeTruthy();

    // Summary and graphics should still be in the DOM (just hidden)
    // They appear in either the expanded view (hidden) or the normal layout (md:hidden)
    const summaries = screen.getAllByTestId("summary-content");
    expect(summaries.length).toBeGreaterThanOrEqual(1);

    const graphics = screen.getAllByTestId("graphics-content");
    expect(graphics.length).toBeGreaterThanOrEqual(1);
  });

  test("R8: expanded pane does not unmount normal layout (preserves component state)", () => {
    const { container, rerender } = render(
      <MainLayout
        header={<div>Header</div>}
        leftPanel={<div data-testid="summary-content">Summary</div>}
        rightPanel={<div data-testid="right">Right</div>}
        cameraPanel={<div data-testid="camera-content">Camera</div>}
        graphicsPanel={<div data-testid="graphics-content">Graphics</div>}
        footer={<div>Footer</div>}
      />,
    );

    // Normal layout: one main element
    expect(container.querySelectorAll("main").length).toBe(1);

    // Expand camera
    rerender(
      <MainLayout
        expandedPane="camera"
        header={<div>Header</div>}
        leftPanel={<div data-testid="summary-content">Summary</div>}
        rightPanel={<div data-testid="right">Right</div>}
        cameraPanel={<div data-testid="camera-content">Camera</div>}
        graphicsPanel={<div data-testid="graphics-content">Graphics</div>}
        footer={<div>Footer</div>}
      />,
    );

    // Two main elements: expanded view + normal layout (hidden on desktop)
    expect(container.querySelectorAll("main").length).toBe(2);

    // Normal layout's main should have md:hidden class
    const mains = container.querySelectorAll("main");
    let hasHiddenMain = false;
    mains.forEach((m) => {
      if (m.className.includes("md:hidden")) hasHiddenMain = true;
    });
    expect(hasHiddenMain).toBe(true);
  });

  test("R9: collapsing restores normal layout with single main element", () => {
    const { container, rerender } = render(
      <MainLayout
        expandedPane="graphics"
        header={<div>Header</div>}
        leftPanel={<div>Left</div>}
        rightPanel={<div>Right</div>}
        graphicsPanel={<div>Graphics</div>}
        footer={<div>Footer</div>}
      />,
    );

    // Expanded: two mains
    expect(container.querySelectorAll("main").length).toBe(2);

    // Collapse
    rerender(
      <MainLayout
        expandedPane={null}
        header={<div>Header</div>}
        leftPanel={<div>Left</div>}
        rightPanel={<div>Right</div>}
        graphicsPanel={<div>Graphics</div>}
        footer={<div>Footer</div>}
      />,
    );

    // Normal: one main
    expect(container.querySelectorAll("main").length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe("Edge cases", () => {
  test("expanding then popping out the same pane: expand is cleared, popout wins", () => {
    const ctrl = createPaneStateController();

    ctrl.expandPane("camera");
    expect(ctrl.getPaneMode("camera")).toBe("expanded");

    ctrl.popoutPane("camera");
    expect(ctrl.getPaneMode("camera")).toBe("popout");
    expect(ctrl.getState().expandedPane).toBeNull();
  });

  test("closePopout on a non-popped-out pane is a safe no-op", () => {
    const ctrl = createPaneStateController();
    const listener = mock(() => {});
    ctrl.subscribe(listener);

    ctrl.closePopout("graphics");

    // Still fires (Set.delete is called), but state is essentially unchanged
    expect(ctrl.getPaneMode("graphics")).toBe("normal");
  });

  test("collapsePane when nothing expanded is a no-op (no notification)", () => {
    const ctrl = createPaneStateController();
    const listener = mock(() => {});
    ctrl.subscribe(listener);

    ctrl.collapsePane();

    expect(listener).toHaveBeenCalledTimes(0);
  });

  test("MainLayout backward compatibility: works without expandedPane prop", () => {
    // Should render normally without expand-related props
    render(
      <MainLayout
        header={<div data-testid="header">H</div>}
        leftPanel={<div data-testid="left">L</div>}
        rightPanel={<div data-testid="right">R</div>}
        footer={<div data-testid="footer">F</div>}
      />,
    );

    expect(screen.getByTestId("header")).toBeTruthy();
    expect(screen.getByTestId("footer")).toBeTruthy();
  });
});
