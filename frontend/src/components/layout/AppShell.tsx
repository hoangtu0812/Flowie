"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, User } from "@/lib/api";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";

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
      <Sidebar user={user} />
      <main className="ml-[260px] flex flex-col min-h-screen bg-white">
        <TopBar title={title} user={user} actions={actions} />
        <div className="flex-grow">{children}</div>
      </main>
    </div>
  );
}
