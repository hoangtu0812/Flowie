"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell as AstryxAppShell } from "@astryxdesign/core/AppShell";
import { Center } from "@astryxdesign/core/Center";
import { HStack } from "@astryxdesign/core/Layout";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Text } from "@astryxdesign/core/Text";
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
      <Center axis="both" height="100vh">
        <HStack gap={2} vAlign="center">
          <Spinner size="sm" />
          <Text color="secondary">Đang tải…</Text>
        </HStack>
      </Center>
    );
  }
  if (state === "anon") return null;

  return (
    <>
      <KeyboardShortcuts />
      {/* contentPadding=0: nội dung chủ đạo của Flowie là bảng/board dày đặc,
          từng trang tự quyết inset bằng Section (xem `astryx docs layout`).
          Trạng thái thu gọn sidebar do SideNav tự giữ, không cần shell chỉnh lề. */}
      <AstryxAppShell
        sideNav={<Sidebar user={user} />}
        topNav={<TopBar title={title} user={user} actions={actions} />}
        contentPadding={0}>
        {children}
      </AstryxAppShell>
    </>
  );
}
