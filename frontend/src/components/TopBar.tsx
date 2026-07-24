"use client";

import { useState } from "react";
import { api, User } from "@/lib/api";
import Icon from "./Icon";
import NotificationBell from "./NotificationBell";

function initials(u: User) {
  const base = u.displayName || u.email;
  return base
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");
}

export default function TopBar({
  title,
  user,
  actions,
}: {
  title: React.ReactNode;
  user: User | null;
  actions?: React.ReactNode;
}) {
  const [menu, setMenu] = useState(false);

  return (
    <header className="flex justify-between items-center w-full px-lg h-16 sticky top-0 z-40 bg-surface border-b border-outline-variant">
      <div className="flex items-center gap-lg min-w-0">
        <div className="relative hidden md:block">
          <Icon
            name="search"
            size={20}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant"
          />
          <input
            className="bg-surface-container-low border-none rounded-lg pl-10 pr-md py-2 w-64 focus:ring-2 focus:ring-primary/20 transition-all text-body-sm outline-none"
            placeholder="Search…"
            type="text"
          />
        </div>
        <div className="h-6 w-px bg-outline-variant hidden md:block" />
        <div className="text-headline-md text-on-surface truncate">{title}</div>
      </div>

      <div className="flex items-center gap-md">
        {actions}
        <NotificationBell />
        {user && (
          <div className="relative">
            <button
              onClick={() => setMenu((m) => !m)}
              className="h-9 w-9 rounded-full bg-primary text-on-primary flex items-center justify-center text-label-sm active:scale-95 transition-transform"
            >
              {initials(user)}
            </button>
            {menu && (
              <div className="absolute right-0 mt-2 w-56 card shadow-popover p-sm z-50">
                <div className="px-md py-sm">
                  <p className="text-label-md text-on-surface">{user.displayName}</p>
                  <p className="text-body-sm text-on-surface-variant truncate">
                    {user.email}
                  </p>
                </div>
                <div className="border-t border-outline-variant my-sm" />
                <button
                  onClick={async () => {
                    await api.logout();
                    window.location.href = "/login";
                  }}
                  className="w-full text-left px-md py-sm rounded-lg hover:bg-surface-container text-body-md flex items-center gap-sm"
                >
                  <Icon name="logout" size={18} />
                  Đăng xuất
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
