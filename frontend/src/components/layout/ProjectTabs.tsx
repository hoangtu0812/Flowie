"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { TabList, Tab } from "@astryxdesign/core/TabList";
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

  const active =
    tabs.find((t) => (t.exact ? pathname === t.href : pathname.startsWith(t.href)))?.href ??
    tabs[0].href;

  // TabList tự lo trạng thái chọn, tràn ngang và độ rộng ổn định. Bản cũ phải
  // tự vẽ border-b, tự tô màu từng tab, và nhân đôi nhãn ở dạng ẩn để giữ chỗ
  // cho chữ đậm — nếu không, đổi tab sẽ làm cả hàng co giãn.
  // onChange là no-op: các tab này điều hướng bằng href, không đổi state tại chỗ.
  return (
    <TabList value={active} onChange={() => {}} hasDivider>
      {tabs.map((t) => (
        <Tab
          key={t.href}
          value={t.href}
          label={t.label}
          href={t.href}
          as={Link}
          icon={<Icon name={t.icon} size={18} />}
        />
      ))}
    </TabList>
  );
}
