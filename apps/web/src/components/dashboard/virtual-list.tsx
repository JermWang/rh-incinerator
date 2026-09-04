"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef, type ReactNode } from "react";

/**
 * Windowed list for very large asset sets. Below the threshold the caller
 * renders rows directly; above it, only visible rows are mounted.
 */
export function VirtualList<T>({ items, render, estimate = 82, keyOf }: { items: T[]; render: (item: T) => ReactNode; estimate?: number; keyOf: (item: T) => string }) {
  const parentRef = useRef<HTMLDivElement>(null);
  const v = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimate,
    overscan: 8,
    getItemKey: (i) => keyOf(items[i]!),
  });
  return (
    <div ref={parentRef} className="scrollbar-thin max-h-[70dvh] overflow-y-auto pr-1">
      <div style={{ height: v.getTotalSize(), position: "relative" }}>
        {v.getVirtualItems().map((row) => (
          <div
            key={row.key}
            data-index={row.index}
            ref={v.measureElement}
            style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${row.start}px)`, paddingBottom: 8 }}
          >
            {render(items[row.index]!)}
          </div>
        ))}
      </div>
    </div>
  );
}
