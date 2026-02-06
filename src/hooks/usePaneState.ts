/**
 * React hook for PaneStateController.
 *
 * Related: src/logic/pane-state-controller.ts, src/components/layout/MainLayout.tsx
 */

import { useCallback, useRef, useSyncExternalStore } from "react";
import type { PaneState, PaneStateController } from "../logic/pane-state-controller";
import { createPaneStateController } from "../logic/pane-state-controller";

export type { PaneState, PaneStateController };

/**
 * Hook that provides pane expand/popout state management.
 */
export function usePaneState(): PaneStateController & PaneState {
  const controllerRef = useRef<PaneStateController | null>(null);

  if (!controllerRef.current) {
    controllerRef.current = createPaneStateController();
  }

  const controller = controllerRef.current;

  const subscribe = useCallback(
    (callback: () => void) => controller.subscribe(callback),
    [controller],
  );

  const getSnapshot = useCallback(() => controller.getState(), [controller]);

  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return {
    ...state,
    getState: controller.getState,
    subscribe: controller.subscribe,
    expandPane: controller.expandPane,
    collapsePane: controller.collapsePane,
    popoutPane: controller.popoutPane,
    closePopout: controller.closePopout,
    getPaneMode: controller.getPaneMode,
  };
}
