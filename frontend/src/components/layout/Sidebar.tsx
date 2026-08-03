"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SideNav, SideNavHeading, SideNavItem, SideNavSection } from "@astryxdesign/core/SideNav";
import { Avatar } from "@astryxdesign/core/Avatar";
import { Item } from "@astryxdesign/core/Item";
import { Token } from "@astryxdesign/core/Token";
import { Project, User, api } from "@/lib/api";
import { useWorkspace } from "@/lib/useWorkspace";
import { materialIcon } from "../ui/materialIcon";

const COLLAPSE_KEY = "sidebar_collapsed";

interface NavItem {
  label: string;
  icon: string;
  href: string;
  /** Mở rộng tại chỗ để liệt kê dự án của workspace. */
  expandable?: boolean;
}

// Nhóm lại để sidebar đọc thành "tôi làm ở đâu" → "nó cộng lại thành gì" →
// "ai và cấu hình thế nào", thay vì một danh sách phẳng mười link.
const groups: { title: string; items: NavItem[] }[] = [
  {
    title: "Làm việc",
    items: [
      { label: "Tổng quan", icon: "dashboard", href: "/" },
      { label: "Dự án", icon: "folder_open", href: "/projects", expandable: true },
      { label: "Lịch", icon: "calendar_today", href: "/calendar" },
      { label: "Chấm công", icon: "schedule", href: "/timesheet" },
    ],
  },
  { title: "Phân tích", items: [{ label: "Báo cáo", icon: "monitoring", href: "/reports" }] },
  { title: "Tổ chức", items: [{ label: "Nhân sự", icon: "group", href: "/team" }] },
];

const FlowieMark = () => <img src="/logo.svg" alt="" width={24} height={24} />;

export default function Sidebar({ user }: { user: User | null }) {
  const pathname = usePathname();
  const { workspaceId } = useWorkspace();
  const [projects, setProjects] = useState<Project[]>([]);
  // Bắt đầu ở trạng thái mở khi đang đứng trong một dự án, để sidebar cho thấy
  // bạn đang ở đâu thay vì bắt mở lại sau mỗi lần điều hướng.
  const [expanded, setExpanded] = useState(() => pathname.startsWith("/projects/"));
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "true");
  }, []);

  useEffect(() => {
    if (!workspaceId) return;
    api.listProjects(workspaceId).then(setProjects).catch(() => setProjects([]));
  }, [workspaceId]);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  function onCollapsedChange(next: boolean) {
    setCollapsed(next);
    localStorage.setItem(COLLAPSE_KEY, String(next));
  }

  return (
    <SideNav
      header={<SideNavHeading heading="Flowie" icon={<FlowieMark />} headingHref="/" />}
      // Nhãn nút thu gọn đến từ i18n (xem lib/astryxLocaleVi.ts), không đặt
      // buttonLabel ở đây để tránh hai nguồn sự thật cho cùng một chuỗi.
      collapsible={{ isCollapsed: collapsed, onCollapsedChange, hasButton: true }}
      footer={
        user ? (
          <Item
            label={user.displayName || "Thành viên"}
            description={user.email}
            startContent={
              <Avatar
                name={user.displayName || user.email}
                src={user.avatarUrl || undefined}
                size="sm"
              />
            }
            onClick={async () => {
              await api.logout();
              window.location.href = "/login";
            }}
          />
        ) : undefined
      }>

      {groups.map((group) => (
        <SideNavSection key={group.title} title={group.title}>
          {group.items.map((item) => {
            const canExpand = item.expandable && projects.length > 0;
            return (
              <SideNavItem
                key={item.href}
                as={Link}
                href={item.href}
                label={item.label}
                icon={materialIcon(item.icon)}
                isSelected={isActive(item.href)}
                collapsible={
                  canExpand
                    ? { isCollapsed: !expanded, onCollapsedChange: (c: boolean) => setExpanded(!c) }
                    : false
                }>
                {canExpand
                  ? projects.map((p) => (
                      <SideNavItem
                        key={p.id}
                        as={Link}
                        href={`/projects/${p.id}`}
                        label={p.name}
                        isSelected={pathname.startsWith(`/projects/${p.id}`)}
                        endContent={<Token label={p.key} size="sm" />}
                      />
                    ))
                  : undefined}
              </SideNavItem>
            );
          })}
        </SideNavSection>
      ))}

      <SideNavSection title="Hệ thống" isHeaderHidden>
        {user?.isSystemAdmin ? (
          <SideNavItem
            as={Link}
            href="/admin"
            label="Admin Panel"
            icon={materialIcon("admin_panel_settings")}
            isSelected={isActive("/admin")}
          />
        ) : null}
        <SideNavItem
          as={Link}
          href="/settings"
          label="Cài đặt"
          icon={materialIcon("settings")}
          isSelected={isActive("/settings")}
        />
      </SideNavSection>
    </SideNav>
  );
}
