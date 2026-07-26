"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "../ui/Icon";

interface Shortcut {
  keys: string;
  label: string;
  run?: (router: ReturnType<typeof useRouter>) => void;
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
  { keys: "Esc", label: "Đóng hộp thoại / bỏ tiêu điểm" },
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
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-black/30 p-md"
      onClick={() => setOpen(false)}
    >
      <div
        className="card shadow-modal p-lg w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-md">
          <h3 className="text-headline-md text-on-surface">Phím tắt</h3>
          <button className="p-1 rounded-full hover:bg-surface-container" onClick={() => setOpen(false)}>
            <Icon name="close" size={20} />
          </button>
        </div>
        <div className="flex flex-col gap-1">
          {SHORTCUTS.map((s) => (
            <div key={s.keys} className="flex items-center justify-between py-1.5 text-body-sm">
              <span className="text-on-surface-variant">{s.label}</span>
              <kbd className="px-2 py-0.5 rounded border border-outline-variant bg-surface-container text-on-surface font-mono text-[12px]">
                {s.keys}
              </kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
