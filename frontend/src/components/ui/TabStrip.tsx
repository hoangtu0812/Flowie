"use client";

import { TabList, Tab } from "@astryxdesign/core/TabList";
import Icon from "./Icon";

export interface TabDef {
  key: string;
  label: string;
  icon?: string;
}

/**
 * Tab trong trang — nay dựng bằng TabList/Tab của Astryx thay vì tự vẽ border
 * và trạng thái active bằng Tailwind. Giữ API cũ (`tabs`, `active`, `onChange`)
 * để chỗ gọi không phải sửa.
 */
export default function TabStrip({
  tabs,
  active,
  onChange,
}: {
  tabs: TabDef[];
  active: string;
  onChange: (key: string) => void;
}) {
  return (
    <TabList value={active} onChange={onChange} hasDivider>
      {tabs.map((t) => (
        <Tab
          key={t.key}
          value={t.key}
          label={t.label}
          icon={t.icon ? <Icon name={t.icon} size={18} /> : undefined}
        />
      ))}
    </TabList>
  );
}
