/**
 * Hook for managing a popout browser window with React Portal support.
 *
 * Uses the Document Picture-in-Picture API (Chromium-based browsers including Arc)
 * for a floating always-on-top window. Falls back to window.open() for
 * unsupported browsers (Safari, Firefox).
 *
 * Related: src/components/layout/PopoutPane.tsx
 */

import { useCallback, useEffect, useRef, useState } from "react";

export interface UsePopoutWindowOptions {
  /** Window title */
  title: string;
  /** Popout window width (default: 800) */
  width?: number;
  /** Popout window height (default: 600) */
  height?: number;
  /** Called when the popout window is closed by the user */
  onClose?: () => void;
}

export interface UsePopoutWindowReturn {
  /** Whether the popout window is currently open */
  isOpen: boolean;
  /**
   * Open the popout window. Must be called from a user gesture (click handler)
   * because Document PiP requires transient activation.
   * Returns true if the window was opened successfully.
   */
  open: () => Promise<boolean>;
  /** Close the popout window */
  close: () => void;
  /** The popout Window object (null when closed) */
  popoutWindow: Window | null;
  /** Mount point for ReactDOM.createPortal (null when closed) */
  portalContainer: HTMLElement | null;
}

/** Check if Document Picture-in-Picture API is available */
function hasDocumentPiP(target: Window): target is WindowWithDocPiP {
  return "documentPictureInPicture" in target;
}

/**
 * Manages a popout browser window with stylesheet copying and React Portal support.
 *
 * Prefers Document PiP API (floating window, works in Arc) when available.
 * Falls back to window.open() for non-Chromium browsers.
 *
 * @example
 * const { isOpen, open, close, portalContainer } = usePopoutWindow({ title: "Camera" });
 * // Call open() from a click handler (transient activation required)
 * // Use ReactDOM.createPortal(children, portalContainer) when isOpen
 */
export function usePopoutWindow(options: UsePopoutWindowOptions): UsePopoutWindowReturn {
  const { title, width = 800, height = 600, onClose } = options;

  const [isOpen, setIsOpen] = useState(false);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);

  const popoutRef = useRef<Window | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const handleClose = useCallback(() => {
    onCloseRef.current?.();
    popoutRef.current = null;
    setIsOpen(false);
    setPortalContainer(null);
  }, []);

  const cleanup = useCallback(() => {
    const popout = popoutRef.current;
    if (popout) {
      popout.removeEventListener("pagehide", handleClose);
      popout.removeEventListener("beforeunload", handleClose);
      if (!popout.closed) {
        popout.close();
      }
    }
    popoutRef.current = null;
    setIsOpen(false);
    setPortalContainer(null);
  }, [handleClose]);

  const open = useCallback(async (): Promise<boolean> => {
    // No-op if already open
    if (popoutRef.current && !popoutRef.current.closed) {
      return true;
    }

    let popout: Window | null = null;

    if (hasDocumentPiP(window)) {
      try {
        // Document PiP API: creates a floating always-on-top window
        // Requires transient activation (must be called from click handler)
        popout = await window.documentPictureInPicture.requestWindow({
          width,
          height,
        });
      } catch {
        // Fallback to window.open if PiP fails (e.g., no transient activation)
        popout = null;
      }
    }

    // Fallback: window.open for non-Chromium browsers or PiP failure
    if (!popout) {
      const features = `popup=true,width=${width},height=${height},left=100,top=100`;
      popout = window.open("", title, features);
    }

    // Handle popup blocker
    if (!popout) {
      setIsOpen(false);
      setPortalContainer(null);
      return false;
    }

    popoutRef.current = popout;

    // Copy stylesheets from parent document to popout document
    copyStylesheets(document, popout.document);

    // Constrain popout body to viewport (prevent scroll overflow)
    Object.assign(popout.document.body.style, {
      margin: "0",
      padding: "0",
      overflow: "hidden",
      height: "100vh",
      width: "100vw",
    });

    // Create portal mount point in the popout window's body
    const container = popout.document.createElement("div");
    Object.assign(container.style, {
      height: "100%",
      width: "100%",
      overflow: "hidden",
    });
    popout.document.body.appendChild(container);

    // Document PiP uses "pagehide", window.open uses "beforeunload"
    popout.addEventListener("pagehide", handleClose);
    popout.addEventListener("beforeunload", handleClose);

    setPortalContainer(container);
    setIsOpen(true);
    return true;
  }, [title, width, height, handleClose]);

  const close = useCallback(() => {
    cleanup();
  }, [cleanup]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return {
    isOpen,
    open,
    close,
    popoutWindow: popoutRef.current,
    portalContainer,
  };
}

/**
 * Copy all <style> and <link rel="stylesheet"> elements from source to target document head.
 * This ensures Tailwind CSS classes work in the popout window.
 */
function copyStylesheets(sourceDoc: Document, targetDoc: Document): void {
  // Copy <style> elements
  const styles = sourceDoc.querySelectorAll("style");
  styles.forEach((style) => {
    const clone = style.cloneNode(true);
    targetDoc.head.appendChild(clone);
  });

  // Copy <link rel="stylesheet"> elements
  const links = sourceDoc.querySelectorAll('link[rel="stylesheet"]');
  links.forEach((link) => {
    const clone = link.cloneNode(true);
    targetDoc.head.appendChild(clone);
  });
}

/** Type for window with Document PiP API */
interface WindowWithDocPiP extends Window {
  documentPictureInPicture: {
    requestWindow: (options: { width: number; height: number }) => Promise<Window>;
  };
}
