"use client";

import Link from "next/link";
import { api, User } from "@/lib/api";

export default function TopBar({ user }: { user: User | null }) {
  return (
    <div className="topbar">
      <Link href="/" className="brand" style={{ color: "var(--text)" }}>
        Flowie
      </Link>
      <div className="row">
        {user && <span className="muted">{user.displayName || user.email}</span>}
        {user && (
          <button
            className="secondary"
            onClick={async () => {
              await api.logout();
              window.location.href = "/";
            }}
          >
            Đăng xuất
          </button>
        )}
      </div>
    </div>
  );
}
