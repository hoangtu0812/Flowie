"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, User } from "@/lib/api";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import KeyboardShortcuts from "./KeyboardShortcuts";

export default function AppShell({
  title,
  actions,
  children,
}: {
  title: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "anon">("loading");
  const [collapsed, setCollapsed] = useState<boolean>(false);

  useEffect(() => {
    const saved = localStorage.getItem("sidebar_collapsed");
    if (saved === "true") {
      setCollapsed(true);
    }
  }, []);

  const toggleSidebar = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("sidebar_collapsed", String(next));
      return next;
    });
  };

  useEffect(() => {
    (async () => {
      try {
        const u = await api.me();
        setUser(u);
        setState("ready");
      } catch {
        setState("anon");
        router.replace("/login");
      }
    })();
  }, [router]);

  if (state === "loading") {
    return (
      <div className="min-h-screen grid place-items-center text-on-surface-variant">
        <div className="flex items-center gap-sm">
          <span className="material-symbols-outlined animate-spin">progress_activity</span>
          Đang tải…
        </div>
      </div>
    );
  }
  if (state === "anon") return null;

  return (
    <div>
      <KeyboardShortcuts />
      <Sidebar user={user} collapsed={collapsed} onToggle={toggleSidebar} />
      <main className={`flex flex-col min-h-screen bg-white transition-all duration-300 ${collapsed ? "ml-[70px]" : "ml-[260px]"}`}>
        <TopBar title={title} user={user} actions={actions} />
        <div className="flex-grow">{children}</div>
      </main>
    </div>
  );
}
