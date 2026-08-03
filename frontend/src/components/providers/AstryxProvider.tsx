"use client";

import { useEffect, useState } from "react";
import { Theme } from "@astryxdesign/core";
import { neutralTheme } from "@astryxdesign/theme-neutral/built";
import { readStoredTheme, type Theme as ThemeChoice } from "@/components/layout/ThemeToggle";

/**
 * Cầu nối giữa cơ chế theme sẵn có của Flowie và Theme provider của Astryx.
 *
 * Flowie lưu lựa chọn ở localStorage "flowie:theme" và bật/tắt class `.dark`
 * trên <html> (xem ThemeToggle). Astryx lại đọc prop `mode` rồi tự đồng bộ
 * `data-theme` / `data-astryx-theme` lên <html>. Component này đọc đúng một
 * nguồn sự thật đó và truyền xuống, để hai hệ không lệch nhau.
 */
export default function AstryxProvider({ children }: { children: React.ReactNode }) {
  // Khởi tạo "system" cho khớp server render; giá trị thật đọc sau khi mount
  // để tránh hydration mismatch (localStorage không có ở server).
  const [mode, setMode] = useState<ThemeChoice>("system");

  useEffect(() => {
    setMode(readStoredTheme());

    // ThemeToggle ghi localStorage ở tab này, còn tab khác đổi thì bắt qua
    // sự kiện "storage".
    const onStorage = (e: StorageEvent) => {
      if (e.key === "flowie:theme") setMode(readStoredTheme());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return (
    <Theme theme={neutralTheme} mode={mode}>
      {children}
    </Theme>
  );
}
