"use client";

import Icon from "./Icon";

export interface TabDef {
  key: string;
  label: string;
  icon?: string;
}

/**
 * In-page tab strip. Matches the look of ProjectTabs (which navigates between
 * routes) so switching sections feels the same everywhere in the app.
 */
export default function TabStrip({
  tabs,
  active,
  onChange,
  className = "",
}: {
  tabs: TabDef[];
  active: string;
  onChange: (key: string) => void;
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap gap-xs border-b border-outline-variant ${className}`}>
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={`flex items-center gap-xs px-md py-2 text-body-md border-b-2 -mb-px transition-colors ${
            active === t.key
              ? "border-primary text-primary font-medium"
              : "border-transparent text-on-surface-variant hover:text-on-surface"
          }`}
        >
          {t.icon && <Icon name={t.icon} size={18} />}
          {t.label}
        </button>
      ))}
    </div>
  );
}
