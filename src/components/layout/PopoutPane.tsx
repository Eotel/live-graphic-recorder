/**
 * Wrapper that renders children normally or portals them to a popout window.
 *
 * When isPopout=true and portalContainer is provided, renders children via
 * ReactDOM.createPortal into the popout window and shows a PaneSkeleton
 * placeholder in the original position.
 *
 * NOTE: usePopoutWindow is intentionally NOT used here. It must be called
 * at the App level so that open() can be invoked directly from the click
 * handler (Document PiP API requires transient activation / user gesture).
 *
 * Related: src/hooks/usePopoutWindow.ts, src/components/layout/PaneSkeleton.tsx
 */

import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import type { PaneId } from "@/logic/pane-state-controller";
import { PaneSkeleton } from "./PaneSkeleton";
import { useTranslation } from "react-i18next";

interface PopoutPaneProps {
  paneId: PaneId;
  isPopout: boolean;
  /** Portal mount point from usePopoutWindow (null when not open) */
  portalContainer: HTMLElement | null;
  /** Called when user clicks the skeleton to focus the popout window */
  onFocusPopout?: () => void;
  children: ReactNode;
  placeholder?: ReactNode;
}

export function PopoutPane({
  paneId,
  isPopout,
  portalContainer,
  onFocusPopout,
  children,
  placeholder,
}: PopoutPaneProps) {
  const { t } = useTranslation();
  const paneLabels: Record<PaneId, string> = {
    summary: t("layout.paneSummary"),
    camera: t("layout.paneCamera"),
    graphics: t("layout.paneGraphics"),
  };

  // When popped out with a valid portal container, render children into the popout window
  if (isPopout && portalContainer) {
    return (
      <>
        {placeholder ?? (
          <PaneSkeleton paneId={paneId} label={paneLabels[paneId]} onFocus={onFocusPopout} />
        )}
        {createPortal(children, portalContainer)}
      </>
    );
  }

  // Normal rendering
  return <>{children}</>;
}
