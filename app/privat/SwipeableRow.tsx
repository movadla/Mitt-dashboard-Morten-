"use client";

import { useRef, useState } from "react";

const THRESHOLD = 70;
const MAX_DRAG = 120;

export default function SwipeableRow({
  children,
  onSwipeRight,
  onSwipeLeft,
  rightLabel = "Fullført",
  leftLabel = "Slett",
}: {
  children: React.ReactNode;
  onSwipeRight?: () => void;
  onSwipeLeft?: () => void;
  rightLabel?: string;
  leftLabel?: string;
}) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const axis = useRef<"x" | "y" | null>(null);

  function handlePointerDown(e: React.PointerEvent) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    start.current = { x: e.clientX, y: e.clientY };
    axis.current = null;
    setDragging(true);
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!start.current) return;
    const deltaX = e.clientX - start.current.x;
    const deltaY = e.clientY - start.current.y;

    if (!axis.current) {
      if (Math.abs(deltaX) > 8 || Math.abs(deltaY) > 8) {
        axis.current = Math.abs(deltaX) > Math.abs(deltaY) ? "x" : "y";
      }
    }
    if (axis.current === "x") {
      let clamped = Math.max(-MAX_DRAG, Math.min(MAX_DRAG, deltaX));
      if (clamped > 0 && !onSwipeRight) clamped = 0;
      if (clamped < 0 && !onSwipeLeft) clamped = 0;
      setDx(clamped);
    }
  }

  function endDrag() {
    if (axis.current === "x") {
      if (dx > THRESHOLD && onSwipeRight) {
        onSwipeRight();
      } else if (dx < -THRESHOLD && onSwipeLeft) {
        onSwipeLeft();
      }
    }
    start.current = null;
    axis.current = null;
    setDragging(false);
    setDx(0);
  }

  return (
    <div className="relative overflow-hidden rounded-xl">
      <div className="absolute inset-0 flex items-center justify-between px-4">
        <span
          className="text-xs font-semibold text-status-positive transition-opacity"
          style={{ opacity: dx > 16 ? Math.min(1, dx / THRESHOLD) : 0 }}
        >
          {rightLabel}
        </span>
        <span
          className="text-xs font-semibold text-status-danger transition-opacity"
          style={{ opacity: dx < -16 ? Math.min(1, -dx / THRESHOLD) : 0 }}
        >
          {leftLabel}
        </span>
      </div>
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        style={{
          transform: `translateX(${dx}px)`,
          transition: dragging ? "none" : "transform 0.2s ease",
          touchAction: "pan-y",
        }}
      >
        {children}
      </div>
    </div>
  );
}
