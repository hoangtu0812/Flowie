"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Section } from "@astryxdesign/core/Section";
import { List, ListItem } from "@astryxdesign/core/List";
import { Kbd } from "@astryxdesign/core/Kbd";

interface Shortcut {
  keys: string;
  /** Chuỗi cho Kbd (dùng "+" ngăn phím); bỏ trống thì hiện `keys` như nhãn. */
  kbd?: string;
  label: string;
}

// `g` then a letter navigates, mirroring Gmail/Linear conventions.
const NAV: Record<string, { path: string; label: string }> = {
  d: { path: "/", label: "Dashboard" },
  p: { path: "/projects", label: "Dự án" },
  c: { path: "/calendar", label: "Lịch" },
  t: { path: "/timesheet", label: "Chấm công" },
  r: { path: "/reports", label: "Báo cáo" },
  m: { path: "/team", label: "Team" },
  s: { path: "/settings", label: "Cài đặt" },
};

const SHORTCUTS: Shortcut[] = [
  { keys: "?", label: "Mở bảng phím tắt này" },
  { keys: "/", label: "Nhảy tới ô tìm kiếm" },
  { keys: "g rồi d", label: "Đi tới Dashboard" },
  { keys: "g rồi p", label: "Đi tới Dự án" },
  { keys: "g rồi c", label: "Đi tới Lịch" },
  { keys: "g rồi t", label: "Đi tới Chấm công" },
  { keys: "g rồi r", label: "Đi tới Báo cáo" },
  { keys: "g rồi m", label: "Đi tới Team" },
  { keys: "g rồi s", label: "Đi tới Cài đặt" },
  { keys: "Esc", kbd: "escape", label: "Đóng hộp thoại / bỏ tiêu điểm" },
];

/** Returns true when focus is inside an editable control. */
function isTyping(el: EventTarget | null): boolean {
  const node = el as HTMLElement | null;
  if (!node) return false;
  const tag = node.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    node.isContentEditable
  );
}

/**
 * Global keyboard shortcuts. Mounted once in AppShell.
 * Every handler bails out while the user is typing so shortcuts never
 * swallow real input.
 */
export default function KeyboardShortcuts() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pendingG, setPendingG] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "Escape") {
        setOpen(false);
        setPendingG(false);
        if (isTyping(document.activeElement)) {
          (document.activeElement as HTMLElement).blur();
        }
        return;
      }

      if (isTyping(e.target)) return;

      // Second key of a "g <letter>" sequence.
      if (pendingG) {
        setPendingG(false);
        const target = NAV[e.key.toLowerCase()];
        if (target) {
          e.preventDefault();
          router.push(target.path);
        }
        return;
      }

      if (e.key === "g") {
        setPendingG(true);
        // Forget the prefix if nothing follows shortly.
        setTimeout(() => setPendingG(false), 1500);
        return;
      }
      if (e.key === "?") {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (e.key === "/") {
        const search = document.querySelector<HTMLInputElement>(
          'input[placeholder*="Search"], input[placeholder*="Tìm"]',
        );
        if (search) {
          e.preventDefault();
          search.focus();
        }
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, pendingG]);

  if (!open) return null;

  return (
    <Dialog isOpen onOpenChange={setOpen} width={480}>
      <DialogHeader title="Phím tắt" onOpenChange={setOpen} />
      <Section variant="transparent" padding={4}>
        {/* Danh sách dày, quét bằng mắt → rows, không bọc Card từng dòng. */}
        <List>
          {SHORTCUTS.map((s) => (
            <ListItem
              key={s.keys}
              label={s.label}
              endContent={s.kbd ? <Kbd keys={s.kbd} /> : <Kbd keys={s.keys} />}
            />
          ))}
        </List>
      </Section>
    </Dialog>
  );
}
