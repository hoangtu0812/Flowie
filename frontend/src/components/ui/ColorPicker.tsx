"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { Popover } from "@astryxdesign/core/Popover";
import { Button } from "@astryxdesign/core/Button";
import { Grid } from "@astryxdesign/core/Grid";
import { VStack, HStack, StackItem } from "@astryxdesign/core/Layout";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Divider } from "@astryxdesign/core/Divider";
import Icon from "./Icon";
import { STATUS_SWATCHES, statusHex } from "@/lib/status";

/**
 * Colour picker for workflow columns.
 *
 * The colour was a <select> of six palette names ("blue", "purple") — you had
 * to guess what each looked like and couldn't use anything else. This offers a
 * swatch grid plus the OS colour picker, so any colour is reachable.
 *
 * Ô màu và input type=color buộc phải dùng `style`/element gốc: giá trị là màu
 * người dùng chọn lúc chạy, không phải token thiết kế, và Astryx không có
 * component chọn màu.
 */
export default function ColorPicker({
  value,
  onChange,
}: {
  /** Hex ("#3b82f6") or a legacy palette name. */
  value: string;
  onChange: (hex: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const hex = statusHex(value);
  const [draft, setDraft] = useState(hex);

  useEffect(() => setDraft(hex), [hex]);

  function commit(next: string) {
    if (/^#[0-9a-fA-F]{6}$/.test(next)) onChange(next.toLowerCase());
  }

  const swatch = (color: string, size: number): CSSProperties => ({
    width: size,
    height: size,
    borderRadius: "50%",
    backgroundColor: color,
    border: "1px solid var(--color-border)",
    display: "grid",
    placeItems: "center",
  });

  const nativePicker: CSSProperties = {
    width: 32,
    height: 32,
    padding: 0,
    background: "transparent",
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius-md, 4px)",
    cursor: "pointer",
  };

  return (
    <Popover
      isOpen={open}
      onOpenChange={setOpen}
      label="Chọn màu"
      width={224}
      content={
        <VStack gap={3} hAlign="stretch">
          <Grid columns={8} gap={1.5}>
            {STATUS_SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                title={c}
                aria-label={`Màu ${c}`}
                onClick={() => {
                  onChange(c);
                  setOpen(false);
                }}
                style={swatch(c, 20)}>
                {c === hex && <Icon name="check" size={12} />}
              </button>
            ))}
          </Grid>

          <Divider />

          <HStack gap={2} vAlign="center">
            {/* The OS picker covers everything the swatches don't. */}
            <input
              type="color"
              value={hex}
              onChange={(e) => {
                setDraft(e.target.value);
                commit(e.target.value);
              }}
              style={nativePicker}
              title="Chọn màu tự do"
              aria-label="Chọn màu tự do"
            />
            <StackItem size="fill">
              <TextInput
                label="Mã màu"
                isLabelHidden
                size="sm"
                value={draft}
                placeholder="#3b82f6"
                onChange={(v) => {
                  const next = v.startsWith("#") ? v : `#${v}`;
                  setDraft(next);
                  commit(next);
                }}
              />
            </StackItem>
          </HStack>
        </VStack>
      }>
      <Button
        label={hex}
        variant="secondary"
        size="sm"
        icon={<span aria-hidden="true" style={swatch(hex, 16)} />}
        endContent={<Icon name="expand_more" size={16} />}
      />
    </Popover>
  );
}
