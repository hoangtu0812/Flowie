"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon from "./Icon";
import { User, api } from "@/lib/api";

interface NavItem {
  label: string;
  icon: string;
  href: string;
  hasArrow?: boolean;
}

const navigate: NavItem[] = [
  { label: "Dashboard", icon: "dashboard", href: "/", hasArrow: true },
  { label: "Projects", icon: "folder_open", href: "/projects", hasArrow: true },
  { label: "Calendar", icon: "calendar_today", href: "/calendar", hasArrow: true },
  { label: "Timesheet", icon: "schedule", href: "/timesheet", hasArrow: true },
  { label: "Analytics", icon: "monitoring", href: "/analytics", hasArrow: true },
  { label: "Team", icon: "group", href: "/team", hasArrow: true },
];

export default function Sidebar({ user }: { user: User | null }) {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <aside className="fixed left-0 top-0 h-full w-[260px] flex flex-col py-md bg-white border-r border-outline-variant/30 z-50 overflow-y-auto overflow-x-hidden">
      {/* Top Header */}
      <div className="flex items-center justify-between px-lg mb-lg">
        <div className="flex items-center gap-sm">
          <div className="w-8 h-8 rounded-full bg-black flex items-center justify-center">
            <div className="w-2.5 h-2.5 bg-white rounded-full"></div>
          </div>
          <span className="font-semibold text-[15px] text-gray-900">Flowie</span>
        </div>
        <div className="flex items-center gap-2 text-gray-400">
          <Icon name="bolt" size={18} />
          <Icon name="vertical_split" size={18} />
        </div>
      </div>

      {/* Navigate Section */}
      <div className="px-md mb-2 flex items-center justify-between text-gray-900 font-semibold text-[13px]">
        <span>Navigate</span>
        <Icon name="expand_less" size={18} className="text-gray-400" />
      </div>
      
      <nav className="flex flex-col gap-[2px] px-sm mb-lg">
        {navigate.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`group flex items-center justify-between px-3 py-2 rounded-xl transition-all ${
                active
                  ? "bg-white shadow-sm border border-gray-100/50 text-gray-900 font-medium"
                  : "text-gray-500 hover:bg-gray-50"
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon name={item.icon} size={20} className={active ? "text-gray-900" : "text-gray-400"} />
                <span className="text-[14px]">{item.label}</span>
              </div>
              <div className="flex items-center gap-2">
                {item.hasArrow && (
                  <Icon name="chevron_right" size={18} className="text-gray-300 group-hover:text-gray-500 transition-colors" />
                )}
              </div>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto pt-4 px-md flex flex-col gap-1">
        {user?.isSystemAdmin && (
          <Link href="/admin" className={`flex items-center justify-between px-3 py-2 rounded-xl transition-all ${isActive("/admin") ? "bg-white shadow-sm border border-gray-100/50 text-gray-900 font-bold" : "text-gray-500 hover:bg-gray-50"}`}>
            <div className="flex items-center gap-3">
              <Icon name="admin_panel_settings" size={20} className={isActive("/admin") ? "text-gray-900" : "text-gray-400"} />
              <span className="text-[14px]">Admin Panel</span>
            </div>
          </Link>
        )}
        <Link href="/settings" className={`flex items-center justify-between px-3 py-2 rounded-xl transition-all ${isActive("/settings") ? "bg-white shadow-sm border border-gray-100/50 text-gray-900 font-medium" : "text-gray-500 hover:bg-gray-50"}`}>
          <div className="flex items-center gap-3">
            <Icon name="settings" size={20} className={isActive("/settings") ? "text-gray-900" : "text-gray-400"} />
            <span className="text-[14px]">Settings</span>
          </div>
        </Link>
      </div>
      
      {/* User Profile Footer */}
      {user && (
        <div className="mx-sm mt-2 mb-2 p-3 flex items-center justify-between rounded-xl hover:bg-gray-50 cursor-pointer border border-gray-100 relative group"
             onClick={async () => {
                await api.logout();
                window.location.href = "/login";
             }}>
          <div className="flex items-center gap-3 min-w-0">
            {user.avatarUrl ? (
              <img src={user.avatarUrl} alt="User" className="w-9 h-9 rounded-full object-cover shrink-0 border border-gray-200" />
            ) : (
              <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold shrink-0">
                {user.displayName?.charAt(0).toUpperCase() || user.email.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="flex flex-col min-w-0">
              <span className="text-[14px] font-semibold text-gray-900 truncate">{user.displayName || "Thành viên"}</span>
              <span className="text-[11px] text-gray-400 truncate">{user.email}</span>
            </div>
          </div>
          <Icon name="logout" size={20} className="text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      )}
    </aside>
  );
}
