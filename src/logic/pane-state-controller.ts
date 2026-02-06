/**
 * Pane state controller - manages expand/popout state for layout panes.
 *
 * Related: src/hooks/usePaneState.ts, src/components/layout/MainLayout.tsx
 */

export type PaneId = "summary" | "camera" | "graphics";

export interface PaneState {
  expandedPane: PaneId | null;
  popoutPanes: ReadonlySet<PaneId>;
}

export interface PaneStateController {
  getState: () => PaneState;
  subscribe: (listener: () => void) => () => void;
  expandPane: (id: PaneId) => void;
  collapsePane: () => void;
  popoutPane: (id: PaneId) => void;
  closePopout: (id: PaneId) => void;
  getPaneMode: (id: PaneId) => "normal" | "expanded" | "popout";
}

/**
 * Create a pane state controller.
 */
export function createPaneStateController(): PaneStateController {
  let state: PaneState = {
    expandedPane: null,
    popoutPanes: new Set<PaneId>(),
  };

  const listeners = new Set<() => void>();

  function notify() {
    for (const listener of listeners) {
      listener();
    }
  }

  function expandPane(id: PaneId): void {
    if (state.popoutPanes.has(id)) return;
    state = { ...state, expandedPane: id };
    notify();
  }

  function collapsePane(): void {
    if (state.expandedPane === null) return;
    state = { ...state, expandedPane: null };
    notify();
  }

  function popoutPane(id: PaneId): void {
    const next = new Set(state.popoutPanes);
    next.add(id);
    state = {
      ...state,
      popoutPanes: next,
      expandedPane: state.expandedPane === id ? null : state.expandedPane,
    };
    notify();
  }

  function closePopout(id: PaneId): void {
    const next = new Set(state.popoutPanes);
    next.delete(id);
    state = { ...state, popoutPanes: next };
    notify();
  }

  function getPaneMode(id: PaneId): "normal" | "expanded" | "popout" {
    if (state.popoutPanes.has(id)) return "popout";
    if (state.expandedPane === id) return "expanded";
    return "normal";
  }

  function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  function getState(): PaneState {
    return state;
  }

  return {
    getState,
    subscribe,
    expandPane,
    collapsePane,
    popoutPane,
    closePopout,
    getPaneMode,
  };
}
