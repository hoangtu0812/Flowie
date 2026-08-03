"use client";

import type { CSSProperties } from "react";
import { HStack, VStack, StackItem } from "@astryxdesign/core/Layout";
import { Text } from "@astryxdesign/core/Text";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";

export interface Segment {
  label: string;
  value: number;
  color: string; // any CSS color — chỗ gọi nên truyền var(--color-*)
}

/**
 * Donut vẽ bằng conic-gradient, không kéo thư viện chart nào.
 *
 * `style` ở đây là ngoại lệ có chủ đích: chuỗi gradient và bán kính lỗ giữa
 * được tính từ dữ liệu lúc chạy, không phải giá trị thiết kế nên không token
 * hoá được. Astryx cũng không có component chart để thay thế.
 */
export function Donut({ segments, size = 160 }: { segments: Segment[]; size?: number }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  let acc = 0;
  const stops = segments
    .map((s) => {
      const start = (acc / total) * 360;
      acc += s.value;
      const end = (acc / total) * 360;
      return `${s.color} ${start}deg ${end}deg`;
    })
    .join(", ");

  const ring: CSSProperties = {
    width: size,
    height: size,
    flexShrink: 0,
    position: "relative",
    borderRadius: "50%",
    background: `conic-gradient(${stops})`,
  };
  const hole: CSSProperties = {
    position: "absolute",
    inset: size * 0.22,
    borderRadius: "50%",
    backgroundColor: "var(--color-background-surface)",
    display: "grid",
    placeItems: "center",
  };

  return (
    <HStack gap={5} vAlign="center">
      <div style={ring}>
        <div style={hole}>
          <Text type="display-3" weight="bold">
            {total}
          </Text>
        </div>
      </div>
      <VStack gap={1}>
        {segments.map((s) => (
          <HStack key={s.label} gap={2} vAlign="center">
            <span
              aria-hidden="true"
              style={{
                width: 12,
                height: 12,
                borderRadius: "var(--radius-sm, 2px)",
                background: s.color,
                flexShrink: 0,
              }}
            />
            <Text type="supporting">{s.label}</Text>
            <StackItem size="fill" />
            <Text type="supporting" weight="medium" hasTabularNumbers>
              {s.value}
            </Text>
          </HStack>
        ))}
      </VStack>
    </HStack>
  );
}

/** Danh sách thanh ngang — mỗi dòng là một ProgressBar của Astryx. */
export function BarList({ items }: { items: { label: string; value: number; color?: string }[] }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <VStack gap={2} hAlign="stretch">
      {items.map((i) => (
        <HStack key={i.label} gap={2} vAlign="center">
          <VStack width={96}>
            <Text type="supporting" maxLines={1}>
              {i.label}
            </Text>
          </VStack>
          <StackItem size="fill">
            <ProgressBar label={i.label} isLabelHidden value={i.value} max={max} />
          </StackItem>
          <Text type="supporting" hasTabularNumbers>
            {i.value}
          </Text>
        </HStack>
      ))}
    </VStack>
  );
}
