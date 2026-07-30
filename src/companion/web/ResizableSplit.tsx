import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

export interface ResizableSplitProps {
  left: ReactNode;
  right: ReactNode;
  /** Fraction (0-1) of the container's width the left pane gets by default. */
  defaultLeftFraction?: number;
  minLeftPx?: number;
  minRightPx?: number;
  /** When set, the dragged ratio persists to localStorage under this key and is restored on
   * mount -- a nice-to-have, not required for the drag itself to work. */
  storageKey?: string;
  /** Extra class appended to the left/right pane divs -- e.g. a modifier that opts a pane into
   * `overflow-y: auto` (SVAR's calendar month view can render an expanded-cell overlay taller
   * than the pane; the base `.companion-split-pane` is `overflow: hidden` so the other pane's own
   * internal scroll regions aren't affected by a blanket change here). */
  leftClassName?: string;
  rightClassName?: string;
}

function readStoredFraction(storageKey: string | undefined): number | null {
  if (!storageKey) return null;
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw === null) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 && parsed < 1 ? parsed : null;
  } catch {
    return null;
  }
}

/** Hand-built draggable vertical divider between two panes -- no split-pane library exists in
 * this repo's dependencies. Clamps are expressed in px (not fraction) so callers can reason about
 * "the chat pane never gets narrower than 280px" directly, regardless of the container's total
 * width. */
export function ResizableSplit({
  left,
  right,
  defaultLeftFraction = 0.67,
  minLeftPx = 0,
  minRightPx = 0,
  storageKey,
  leftClassName,
  rightClassName,
}: ResizableSplitProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [leftFraction, setLeftFraction] = useState(
    () => readStoredFraction(storageKey) ?? defaultLeftFraction,
  );
  const draggingRef = useRef(false);
  const leftFractionRef = useRef(leftFraction);
  leftFractionRef.current = leftFraction;

  const clampToContainer = useCallback(
    (fraction: number): number => {
      const width = containerRef.current?.getBoundingClientRect().width;
      if (!width) return fraction;
      const minLeftFraction = minLeftPx / width;
      const maxLeftFraction = 1 - minRightPx / width;
      return Math.min(Math.max(fraction, minLeftFraction), maxLeftFraction);
    },
    [minLeftPx, minRightPx],
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerUp = useCallback(() => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    if (storageKey) {
      try {
        localStorage.setItem(storageKey, String(leftFractionRef.current));
      } catch {
        // best-effort persistence only
      }
    }
  }, [storageKey]);

  useEffect(() => {
    function onMove(e: PointerEvent) {
      if (!draggingRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      if (rect.width === 0) return;
      const fraction = (e.clientX - rect.left) / rect.width;
      setLeftFraction(clampToContainer(fraction));
    }
    function onUp() {
      handlePointerUp();
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [clampToContainer, handlePointerUp]);

  return (
    <div ref={containerRef} className="companion-split-root">
      <div
        className={leftClassName ? `companion-split-pane ${leftClassName}` : "companion-split-pane"}
        style={{ flexBasis: `${leftFraction * 100}%` }}
      >
        {left}
      </div>
      <div
        className="companion-split-divider"
        data-testid="companion-split-divider"
        onPointerDown={handlePointerDown}
      />
      <div
        className={rightClassName ? `companion-split-pane ${rightClassName}` : "companion-split-pane"}
        style={{ flexBasis: `${(1 - leftFraction) * 100}%` }}
      >
        {right}
      </div>
    </div>
  );
}
