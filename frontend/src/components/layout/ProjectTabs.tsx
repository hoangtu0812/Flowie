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
    { label: "Workload", href: `/projects/${projectId}/workload`, icon: "groups" },
    { label: "Automation", href: `/projects/${projectId}/automations`, icon: "bolt" },
  ];
  return (
    <div className="flex gap-xs border-b border-outline-variant mb-lg">
      {tabs.map((t) => {
        const active = t.exact ? pathname === t.href : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`flex items-center gap-xs px-md py-2 text-body-md border-b-2 -mb-px transition-colors ${
              active
                ? "border-primary text-primary font-medium"
                : "border-transparent text-on-surface-variant hover:text-on-surface"
            }`}
          >
            <Icon name={t.icon} size={18} />
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
