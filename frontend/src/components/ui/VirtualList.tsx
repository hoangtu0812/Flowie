"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { VStack } from "@astryxdesign/core/Layout";

/**
 * Renders only the rows currently in view (plus a small overscan), so a backlog
 * of thousands of tasks stays responsive.
 *
 * Rows are assumed to share a fixed height — that keeps the maths exact and
 * avoids the measurement pass a variable-height virtualiser would need. Below
 * `threshold` items the list renders normally, so short lists keep native
 * behaviour (no clipping, no scroll container).
 *
 * NGOẠI LỆ CÓ CHỦ ĐÍCH so với quy tắc "không style={{}}": đây là hạ tầng ảo hoá,
 * `top` của từng dòng được tính từ chỉ số lúc chạy (`index * step`) chứ không
 * phải giá trị thiết kế — không có token nào diễn đạt được. Astryx cũng không
 * có component virtual list. Mọi giá trị *thiết kế* (khoảng cách, nền, viền)
 * vẫn phải do dòng bên trong `renderRow` quyết định bằng component Astryx.
 */
export default function VirtualList<T>({
  items,
  rowHeight,
  renderRow,
  height = 600,
  overscan = 6,
  threshold = 60,
  gap = 0,
}: {
  items: T[];
  rowHeight: number;
  renderRow: (item: T, index: number) => React.ReactNode;
  height?: number;
  overscan?: number;
  threshold?: number;
  gap?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);

  // Reset the offset when the dataset changes, otherwise a filter that shrinks
  // the list can leave the viewport scrolled past the end.
  useEffect(() => {
    setScrollTop(0);
    if (ref.current) ref.current.scrollTop = 0;
  }, [items.length]);

  if (items.length <= threshold) {
    return <VStack hAlign="stretch">{items.map((item, i) => renderRow(item, i))}</VStack>;
  }

  const step = rowHeight + gap;
  const total = items.length * step;
  const first = Math.max(0, Math.floor(scrollTop / step) - overscan);
  const visible = Math.ceil(height / step) + overscan * 2;
  const last = Math.min(items.length, first + visible);
  const slice = items.slice(first, last);

  const viewport: CSSProperties = { height, overflowY: "auto" };
  // Spacer preserves the real scroll height.
  const spacer: CSSProperties = { height: total, position: "relative" };

  return (
    <div ref={ref} onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)} style={viewport}>
      <div style={spacer}>
        {slice.map((item, i) => {
          const index = first + i;
          return (
            <div
              key={index}
              style={{
                position: "absolute",
                top: index * step,
                left: 0,
                right: 0,
                height: rowHeight,
              }}>
              {renderRow(item, index)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
