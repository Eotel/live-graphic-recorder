/**
 * Hook that warns users before leaving the page while unsaved recording exists.
 *
 * Design doc: plans/audio-recording-plan.md
 * Related: src/App.tsx
 */

import { useEffect } from "react";

export function useBeforeUnloadGuard(enabled: boolean): void {
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [enabled]);
}
