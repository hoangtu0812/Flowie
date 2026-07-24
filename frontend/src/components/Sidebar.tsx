"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon from "./Icon";

interface NavItem {
  label: string;
  icon: string;
  href: string;
  badge?: string;
  disabled?: boolean;
}

const navigate: NavItem[] = [
  { label: "Dashboard", icon: "dashboard", href: "/" },
  { label: "Projects", icon: "folder_open", href: "/projects" },
  { label: "My Tasks", icon: "assignment", href: "/tasks", disabled: true },
  { label: "Calendar", icon: "calendar_today", href: "/calendar" },
  { label: "Timesheet", icon: "schedule", href: "/timesheet" },
  { label: "Analytics", icon: "monitoring", href: "/analytics" },
  { label: "Team", icon: "group", href: "/team" },
];

export default function Sidebar() {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <aside className="fixed left-0 top-0 h-full w-64 flex flex-col py-lg px-md border-r border-outline-variant bg-surface-container-low z-50">
      <div className="flex items-center gap-md mb-xl px-sm">
        <div className="w-10 h-10 rounded-lg bg-primary text-on-primary flex items-center justify-center text-headline-md">
          F
        </div>
        <div>
          <h1 className="text-headline-md text-primary leading-tight">Flowie</h1>
          <p className="text-body-sm text-on-surface-variant">Professional Team</p>
        </div>
      </div>

      <p className="px-md mb-xs text-label-sm uppercase tracking-wider text-on-surface-variant/70">
        Navigate
      </p>
      <nav className="flex flex-col gap-xs flex-grow">
        {navigate.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.disabled ? "#" : item.href}
              className={`flex items-center gap-md px-md py-sm rounded-lg transition-all ${
                active
                  ? "bg-primary text-on-primary"
                  : "text-on-surface-variant hover:bg-secondary-container hover:text-on-secondary-container"
              } ${item.disabled ? "opacity-40 pointer-events-none" : ""}`}
            >
              <Icon name={item.icon} size={20} />
              <span className="text-label-md flex-grow">{item.label}</span>
              {item.badge && (
                <span className="bg-error text-on-error text-label-sm rounded-full px-1.5 py-0.5 min-w-5 text-center">
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto border-t border-outline-variant pt-lg flex flex-col gap-md">
        <Link
          href="/settings"
          className="flex items-center gap-md text-on-surface-variant px-md py-sm hover:bg-secondary-container hover:text-on-secondary-container transition-all rounded-lg"
        >
          <Icon name="settings" size={20} />
          <span className="text-label-md">Settings</span>
        </Link>
      </div>
    </aside>
  );
}
