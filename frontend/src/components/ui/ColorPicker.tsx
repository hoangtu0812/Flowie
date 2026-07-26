"use client";

import { useEffect, useRef, useState } from "react";
import Icon from "./Icon";
import { STATUS_SWATCHES, statusHex } from "@/lib/status";

/**
 * Colour picker for workflow columns.
 *
 * The colour was a <select> of six palette names ("blue", "purple") — you had
 * to guess what each looked like and couldn't use anything else. This offers a
 * swatch grid plus the OS colour picker, so any colour is reachable.
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
  const ref = useRef<HTMLDivElement>(null);
  const hex = statusHex(value);
  const [draft, setDraft] = useState(hex);

  useEffect(() => setDraft(hex), [hex]);

  // Click-outside to dismiss, so the popover doesn't trap the page.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function commit(next: string) {
    if (/^#[0-9a-fA-F]{6}$/.test(next)) onChange(next.toLowerCase());
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Đổi màu"
        className="flex items-center gap-1.5 border border-outline-variant rounded-md pl-1.5 pr-1 py-1 hover:border-primary transition-colors"
      >
        <span
          className="w-4 h-4 rounded-full border border-black/10"
          style={{ backgroundColor: hex }}
        />
        <span className="text-body-sm text-on-surface-variant font-mono">{hex}</span>
        <Icon name="expand_more" size={16} className="text-on-surface-variant" />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 card shadow-popover p-3 w-56">
          <div className="grid grid-cols-8 gap-1.5 mb-3">
            {STATUS_SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                title={c}
                onClick={() => { onChange(c); setOpen(false); }}
                className="w-5 h-5 rounded-full border border-black/10 flex items-center justify-center hover:scale-110 transition-transform"
                style={{ backgroundColor: c }}
              >
                {c === hex && <Icon name="check" size={12} className="text-white" />}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 border-t border-outline-variant pt-2">
            {/* The OS picker covers everything the swatches don't. */}
            <input
              type="color"
              value={hex}
              onChange={(e) => { setDraft(e.target.value); commit(e.target.value); }}
              className="w-8 h-8 rounded cursor-pointer border border-outline-variant bg-transparent p-0"
              title="Chọn màu tự do"
            />
            <input
              className="field flex-grow font-mono text-body-sm py-1"
              value={draft}
              maxLength={7}
              onChange={(e) => {
                const v = e.target.value.startsWith("#") ? e.target.value : `#${e.target.value}`;
                setDraft(v);
                commit(v);
              }}
              placeholder="#3b82f6"
            />
          </div>
        </div>
      )}
    </div>
  );
}
