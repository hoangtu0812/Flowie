"use client";

import { useEffect, useState } from "react";
import Icon from "../ui/Icon";

export type Theme = "light" | "dark" | "system";
const STORAGE_KEY = "flowie:theme";

/** Applies the resolved theme by toggling `.dark` on <html>. */
function apply(theme: Theme) {
  const dark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

export function readStoredTheme(): Theme {
  if (typeof window === "undefined") return "system";
  return (localStorage.getItem(STORAGE_KEY) as Theme) || "system";
}

/** Cycles light → dark → system and persists the choice. */
export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    const t = readStoredTheme();
    setTheme(t);
    apply(t);

    // Follow the OS when the user picked "system".
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (readStoredTheme() === "system") apply("system");
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  function cycle() {
    const next: Theme = theme === "light" ? "dark" : theme === "dark" ? "system" : "light";
    setTheme(next);
    localStorage.setItem(STORAGE_KEY, next);
    apply(next);
  }

  const icon = theme === "light" ? "light_mode" : theme === "dark" ? "dark_mode" : "contrast";
  const label =
    theme === "light" ? "Giao diện sáng" : theme === "dark" ? "Giao diện tối" : "Theo hệ thống";

  return (
    <button
      onClick={cycle}
      title={`${label} — nhấn để đổi`}
      data-testid="theme-toggle"
      className="hover:text-gray-600 transition-colors"
    >
      <Icon name={icon} size={22} />
    </button>
  );
}
