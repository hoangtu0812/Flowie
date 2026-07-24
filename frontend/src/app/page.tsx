"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, DashboardStats, Workspace } from "@/lib/api";
import AppShell from "@/components/layout/AppShell";
import Icon from "@/components/ui/Icon";

function StatCard({ icon, label, value }: { icon: string; label: string; value: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm flex items-center gap-4 hover:shadow-md transition-shadow">
      <div className="w-12 h-12 rounded-xl bg-gray-100 text-gray-700 flex items-center justify-center shrink-0">
        <Icon name={icon} size={24} />
      </div>
      <div>
        <p className="text-[24px] font-bold text-gray-900 leading-tight">{value}</p>
        <p className="text-[14px] font-medium text-gray-500 mt-1">{label}</p>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const router = useRouter();

  useEffect(() => {
    api.listWorkspaces().then(res => {
      const wss = res || [];
      setWorkspaces(wss);
      if (wss.length > 0) {
        let activeId = localStorage.getItem('activeWorkspaceId');
        if (!activeId || !wss.some(w => w.id === activeId)) {
           activeId = wss[0].id;
           localStorage.setItem('activeWorkspaceId', activeId);
        }
        router.replace(`/workspaces/${activeId}`);
      }
    }).catch(() => {});
  }, [router]);

  return (
    <AppShell title={null}>
      <div className="p-8 max-w-[1400px] mx-auto mt-8">
        <div className="text-center mb-12">
          <h2 className="text-[32px] font-bold text-gray-900 mb-2">Chào mừng trở lại 👋</h2>
          <p className="text-gray-500 text-[16px]">Vui lòng chọn một Không gian làm việc bên dưới để bắt đầu.</p>
        </div>

        <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 max-w-5xl mx-auto">
          {workspaces.map((ws) => (
            <Link key={ws.id} href={`/workspaces/${ws.id}`}>
              <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm hover:shadow-md hover:border-gray-300 transition-all cursor-pointer group">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gray-50 text-gray-600 group-hover:bg-gray-900 group-hover:text-white flex items-center justify-center shrink-0 transition-colors">
                    <Icon name="workspaces" size={24} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[16px] font-bold text-gray-900 truncate">{ws.name}</p>
                    <p className="text-[13px] font-medium text-gray-400 mt-1">/{ws.slug}</p>
                  </div>
                </div>
              </div>
            </Link>
          ))}
          {workspaces.length === 0 && (
            <div className="bg-gray-50 border border-dashed border-gray-200 rounded-2xl p-10 text-center text-gray-500 col-span-full">
              <Icon name="workspaces" size={40} className="text-gray-300 mb-3 mx-auto" />
              <p className="text-[15px] font-medium">Bạn chưa được phân quyền vào Không gian làm việc nào.</p>
              <p className="text-[14px] mt-2">Vui lòng liên hệ Admin hệ thống để được cấp quyền.</p>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
