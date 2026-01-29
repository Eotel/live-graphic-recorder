/**
 * Hook for auto-scrolling behavior in scrollable containers.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/components/summary/SummaryPanel.tsx
 */

import { useRef, useCallback, useEffect } from "react";

interface UseAutoScrollOptions {
  /** Whether auto-scroll is enabled */
  enabled?: boolean;
  /** Threshold from bottom (in pixels) to re-enable auto-scroll */
  threshold?: number;
  /** Scroll behavior */
  behavior?: ScrollBehavior;
}

export interface AutoScrollState {
  containerRef: React.RefObject<HTMLDivElement | null>;
  isAtBottom: boolean;
}

export interface AutoScrollActions {
  scrollToBottom: () => void;
  checkIsAtBottom: () => boolean;
}

export function useAutoScroll(
  options: UseAutoScrollOptions = {},
): AutoScrollState & AutoScrollActions {
  const { enabled = true, threshold = 50, behavior = "smooth" } = options;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const isAtBottomRef = useRef(true);

  const checkIsAtBottom = useCallback((): boolean => {
    const container = containerRef.current;
    if (!container) return true;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    return distanceFromBottom <= threshold;
  }, [threshold]);

  const scrollToBottom = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    container.scrollTo({
      top: container.scrollHeight,
      behavior,
    });
  }, [behavior]);

  // Track scroll position
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      isAtBottomRef.current = checkIsAtBottom();
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, [checkIsAtBottom]);

  // Auto-scroll when content changes (via MutationObserver)
  useEffect(() => {
    if (!enabled) return;

    const container = containerRef.current;
    if (!container) return;

    const observer = new MutationObserver(() => {
      if (isAtBottomRef.current) {
        scrollToBottom();
      }
    });

    observer.observe(container, {
      childList: true,
      subtree: true,
    });

    return () => observer.disconnect();
  }, [enabled, scrollToBottom]);

  return {
    containerRef,
    isAtBottom: isAtBottomRef.current,
    scrollToBottom,
    checkIsAtBottom,
  };
}
