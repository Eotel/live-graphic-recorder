/**
 * Tests for pane-state-controller.
 *
 * Related: src/logic/pane-state-controller.ts
 */

import { describe, test, expect, mock } from "bun:test";
import { createPaneStateController } from "./pane-state-controller";

describe("createPaneStateController", () => {
  test("initial state has no expanded pane and no popouts", () => {
    const ctrl = createPaneStateController();
    const state = ctrl.getState();

    expect(state.expandedPane).toBeNull();
    expect(state.popoutPanes.size).toBe(0);
  });

  test("expandPane sets expandedPane", () => {
    const ctrl = createPaneStateController();

    ctrl.expandPane("summary");

    expect(ctrl.getState().expandedPane).toBe("summary");
  });

  test("collapsePane clears expandedPane", () => {
    const ctrl = createPaneStateController();

    ctrl.expandPane("camera");
    ctrl.collapsePane();

    expect(ctrl.getState().expandedPane).toBeNull();
  });

  test("expandPane replaces previously expanded pane", () => {
    const ctrl = createPaneStateController();

    ctrl.expandPane("summary");
    ctrl.expandPane("graphics");

    expect(ctrl.getState().expandedPane).toBe("graphics");
  });

  test("popoutPane adds to popoutPanes", () => {
    const ctrl = createPaneStateController();

    ctrl.popoutPane("camera");

    expect(ctrl.getState().popoutPanes.has("camera")).toBe(true);
    expect(ctrl.getState().popoutPanes.size).toBe(1);
  });

  test("multiple panes can be popped out simultaneously", () => {
    const ctrl = createPaneStateController();

    ctrl.popoutPane("camera");
    ctrl.popoutPane("graphics");

    const panes = ctrl.getState().popoutPanes;
    expect(panes.has("camera")).toBe(true);
    expect(panes.has("graphics")).toBe(true);
    expect(panes.size).toBe(2);
  });

  test("closePopout removes from popoutPanes", () => {
    const ctrl = createPaneStateController();

    ctrl.popoutPane("camera");
    ctrl.popoutPane("graphics");
    ctrl.closePopout("camera");

    const panes = ctrl.getState().popoutPanes;
    expect(panes.has("camera")).toBe(false);
    expect(panes.has("graphics")).toBe(true);
    expect(panes.size).toBe(1);
  });

  test("cannot expand a popped-out pane", () => {
    const ctrl = createPaneStateController();

    ctrl.popoutPane("camera");
    ctrl.expandPane("camera");

    expect(ctrl.getState().expandedPane).toBeNull();
  });

  test("popoutPane collapses the pane if it was expanded", () => {
    const ctrl = createPaneStateController();

    ctrl.expandPane("summary");
    ctrl.popoutPane("summary");

    expect(ctrl.getState().expandedPane).toBeNull();
    expect(ctrl.getState().popoutPanes.has("summary")).toBe(true);
  });

  describe("getPaneMode", () => {
    test("returns 'normal' by default", () => {
      const ctrl = createPaneStateController();

      expect(ctrl.getPaneMode("summary")).toBe("normal");
      expect(ctrl.getPaneMode("camera")).toBe("normal");
      expect(ctrl.getPaneMode("graphics")).toBe("normal");
    });

    test("returns 'expanded' for expanded pane", () => {
      const ctrl = createPaneStateController();

      ctrl.expandPane("graphics");

      expect(ctrl.getPaneMode("graphics")).toBe("expanded");
      expect(ctrl.getPaneMode("summary")).toBe("normal");
    });

    test("returns 'popout' for popped-out pane", () => {
      const ctrl = createPaneStateController();

      ctrl.popoutPane("camera");

      expect(ctrl.getPaneMode("camera")).toBe("popout");
    });

    test("popout takes priority over expanded (should not happen but defensive)", () => {
      const ctrl = createPaneStateController();

      // Expand first, then popout — popout should clear expanded
      ctrl.expandPane("camera");
      ctrl.popoutPane("camera");

      expect(ctrl.getPaneMode("camera")).toBe("popout");
    });
  });

  describe("subscribe", () => {
    test("fires listener on expandPane", () => {
      const ctrl = createPaneStateController();
      const listener = mock(() => {});

      ctrl.subscribe(listener);
      ctrl.expandPane("summary");

      expect(listener).toHaveBeenCalledTimes(1);
    });

    test("fires listener on collapsePane", () => {
      const ctrl = createPaneStateController();
      const listener = mock(() => {});

      ctrl.expandPane("summary");

      ctrl.subscribe(listener);
      ctrl.collapsePane();

      expect(listener).toHaveBeenCalledTimes(1);
    });

    test("fires listener on popoutPane", () => {
      const ctrl = createPaneStateController();
      const listener = mock(() => {});

      ctrl.subscribe(listener);
      ctrl.popoutPane("graphics");

      expect(listener).toHaveBeenCalledTimes(1);
    });

    test("fires listener on closePopout", () => {
      const ctrl = createPaneStateController();
      const listener = mock(() => {});

      ctrl.popoutPane("graphics");

      ctrl.subscribe(listener);
      ctrl.closePopout("graphics");

      expect(listener).toHaveBeenCalledTimes(1);
    });

    test("unsubscribe stops notifications", () => {
      const ctrl = createPaneStateController();
      const listener = mock(() => {});

      const unsub = ctrl.subscribe(listener);
      unsub();
      ctrl.expandPane("summary");

      expect(listener).toHaveBeenCalledTimes(0);
    });

    test("does not fire when expand is a no-op (popped-out pane)", () => {
      const ctrl = createPaneStateController();
      const listener = mock(() => {});

      ctrl.popoutPane("camera");

      ctrl.subscribe(listener);
      ctrl.expandPane("camera");

      expect(listener).toHaveBeenCalledTimes(0);
    });

    test("does not fire when collapsePane is a no-op (nothing expanded)", () => {
      const ctrl = createPaneStateController();
      const listener = mock(() => {});

      ctrl.subscribe(listener);
      ctrl.collapsePane();

      expect(listener).toHaveBeenCalledTimes(0);
    });
  });
});
