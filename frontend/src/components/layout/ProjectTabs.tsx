"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon from "../ui/Icon";

export default function ProjectTabs({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const tabs = [
    { label: "Board", href: `/projects/${projectId}`, icon: "view_kanban", exact: true },
    { label: "Dashboard", href: `/projects/${projectId}/dashboard`, icon: "monitoring" },
    { label: "Timeline", href: `/projects/${projectId}/timeline`, icon: "timeline" },
    { label: "Sprints", href: `/projects/${projectId}/sprints`, icon: "sprint" },
    { label: "Reports", href: `/projects/${projectId}/reports`, icon: "insights" },
    { label: "Workload", href: `/projects/${projectId}/workload`, icon: "groups" },
    { label: "Tệp", href: `/projects/${projectId}/files`, icon: "folder" },
    { label: "Automation", href: `/projects/${projectId}/automations`, icon: "bolt" },
    { label: "Chat", href: `/projects/${projectId}/chat`, icon: "forum" },
    { label: "Cài đặt", href: `/projects/${projectId}/settings`, icon: "settings" },
  ];
  return (
    // overflow-x-auto: on a narrow window the row scrolls instead of wrapping,
    // which used to change the bar's height as you moved between tabs.
    <div className="flex gap-xs border-b border-outline-variant mb-lg overflow-x-auto">
      {tabs.map((t) => {
        const active = t.exact ? pathname === t.href : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`flex items-center gap-xs px-md py-2 text-body-md border-b-2 -mb-px transition-colors whitespace-nowrap shrink-0 ${
              active
                ? "border-primary text-primary"
                : "border-transparent text-on-surface-variant hover:text-on-surface"
            }`}
          >
            <Icon name={t.icon} size={18} />
            {/*
              The label is bold when active. Bold text is wider, so switching
              tabs used to resize every tab and could push one onto a second
              line ("Cài đặt"). The hidden bold copy reserves the wider width up
              front, so the row's geometry never changes.
            */}
            <span className="grid">
              <span className={`col-start-1 row-start-1 ${active ? "font-medium" : ""}`}>
                {t.label}
              </span>
              <span aria-hidden className="col-start-1 row-start-1 font-medium invisible">
                {t.label}
              </span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}
