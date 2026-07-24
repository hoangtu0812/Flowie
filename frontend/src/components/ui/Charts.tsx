"use client";

export interface Segment {
  label: string;
  value: number;
  color: string; // any CSS color
}

// Donut chart via conic-gradient (no external chart lib).
export function Donut({ segments, size = 160 }: { segments: Segment[]; size?: number }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  let acc = 0;
  const stops = segments
    .map((s) => {
      const start = (acc / total) * 360;
      acc += s.value;
      const end = (acc / total) * 360;
      return `${s.color} ${start}deg ${end}deg`;
    })
    .join(", ");
  return (
    <div className="flex items-center gap-lg">
      <div
        className="rounded-full flex-shrink-0 relative"
        style={{ width: size, height: size, background: `conic-gradient(${stops})` }}
      >
        <div
          className="absolute rounded-full bg-surface-container-lowest flex items-center justify-center"
          style={{ inset: size * 0.22 }}
        >
          <span className="text-headline-lg text-on-surface">{total}</span>
        </div>
      </div>
      <div className="flex flex-col gap-1">
        {segments.map((s) => (
          <div key={s.label} className="flex items-center gap-sm text-body-sm">
            <span className="w-3 h-3 rounded-sm" style={{ background: s.color }} />
            <span className="text-on-surface-variant capitalize">{s.label}</span>
            <span className="text-on-surface font-medium ml-auto">{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Horizontal bar list.
export function BarList({ items }: { items: { label: string; value: number; color?: string }[] }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="flex flex-col gap-sm">
      {items.map((i) => (
        <div key={i.label} className="flex items-center gap-sm">
          <span className="w-24 text-body-sm text-on-surface-variant capitalize truncate">{i.label}</span>
          <div className="flex-grow bg-surface-container-high rounded-full h-2.5 overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ width: `${(i.value / max) * 100}%`, background: i.color ?? "var(--tw-prose-links, #004ac6)" }}
            />
          </div>
          <span className="w-8 text-right text-body-sm text-on-surface">{i.value}</span>
        </div>
      ))}
    </div>
  );
}
