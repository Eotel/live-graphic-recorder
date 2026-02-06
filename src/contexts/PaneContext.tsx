/**
 * React context for pane expand/popout state.
 *
 * Related: src/hooks/usePaneState.ts, src/logic/pane-state-controller.ts
 */

import { createContext, useContext } from "react";
import type { PaneState, PaneStateController } from "../logic/pane-state-controller";

export type PaneContextValue = PaneStateController & PaneState;

export const PaneContext = createContext<PaneContextValue | null>(null);

/**
 * Access pane state from context. Must be used within a PaneContext.Provider.
 */
export function usePaneContext(): PaneContextValue {
  const ctx = useContext(PaneContext);
  if (!ctx) {
    throw new Error("usePaneContext must be used within a PaneContext.Provider");
  }
  return ctx;
}
