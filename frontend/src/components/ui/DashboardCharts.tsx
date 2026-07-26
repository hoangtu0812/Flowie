"use client";

import { useEffect, useRef, useState } from "react";
import Icon from "./Icon";

// ── Stat tile ────────────────────────────────────────────────
// Big number + period delta, with an optional visual on the right
// (sparkline / ring). Mirrors the dashboard card design.

export function StatTile({
  title,
  value,
  delta,
  invertDelta = false,
  visual,
}: {
  title: string;
  value: React.ReactNode;
  delta?: number;
  /** When true a rising value is bad (e.g. overdue tasks) and shows red. */
  invertDelta?: boolean;
  visual?: React.ReactNode;
}) {
  const up = (delta ?? 0) >= 0;
  const good = invertDelta ? !up : up;
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-4">
        <p className="text-[15px] font-semibold text-gray-700">{title}</p>
        <Icon name="more_horiz" size={18} className="text-gray-300" />
      </div>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[30px] leading-none font-bold text-gray-900 tracking-tight">{value}</p>
          {delta !== undefined && (
            <p className={`flex items-center gap-1 mt-3 text-[13px] font-semibold ${good ? "text-green-600" : "text-red-500"}`}>
              <Icon name={up ? "trending_up" : "trending_down"} size={18} />
              {up ? "+" : ""}{delta.toFixed(2)}%
            </p>
          )}
        </div>
        {visual && <div className="shrink-0">{visual}</div>}
      </div>
    </div>
  );
}

// ── Bar sparkline ────────────────────────────────────────────

export function BarSparkline({
  values,
  width = 130,
  height = 60,
  color = "#3b82f6",
}: {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
}) {
  if (values.length === 0) return <div style={{ width, height }} />;
  const max = Math.max(1, ...values);
  const gap = 3;
  const barW = Math.max(2, (width - gap * (values.length - 1)) / values.length);
  return (
    <svg width={width} height={height} role="img" aria-label="bar sparkline">
      {values.map((v, i) => {
        const h = Math.max(3, (v / max) * height);
        return (
          <rect
            key={i}
            x={i * (barW + gap)}
            y={height - h}
            width={barW}
            height={h}
            rx={barW / 2}
            fill={color}
            opacity={0.45 + 0.55 * (v / max)}
          />
        );
      })}
    </svg>
  );
}

// ── Area sparkline ───────────────────────────────────────────

export function AreaSparkline({
  values,
  width = 150,
  height = 60,
  color = "#8b5cf6",
}: {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
}) {
  if (values.length < 2) return <div style={{ width, height }} />;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const pad = 4;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = pad + (1 - (v - min) / span) * (height - pad * 2);
    return [x, y] as const;
  });
  const line = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const gid = `spark-${color.replace("#", "")}`;
  return (
    <svg width={width} height={height} role="img" aria-label="area sparkline">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.28} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={`${line} L${width},${height} L0,${height} Z`} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// ── Ring progress ────────────────────────────────────────────

export function RingProgress({
  percent,
  size = 92,
  stroke = 8,
  color = "#f97316",
  track = "#fdeee2",
}: {
  percent: number;
  size?: number;
  stroke?: number;
  color?: string;
  track?: string;
}) {
  const pct = Math.max(0, Math.min(100, percent));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${(pct / 100) * c} ${c}`}
        />
      </svg>
      <span
        className="absolute inset-0 flex items-center justify-center text-[15px] font-bold"
        style={{ color }}
      >
        {Math.round(pct)}%
      </span>
    </div>
  );
}

// ── Multi-series area chart ──────────────────────────────────

export interface ChartSeries {
  key: string;
  label: string;
  color: string;
}

export function TrendAreaChart({
  labels,
  rows,
  series,
  height = 300,
  valueSuffix = "",
}: {
  labels: string[];
  /** One record per x position, keyed by series key. */
  rows: Record<string, number>[];
  series: ChartSeries[];
  height?: number;
  valueSuffix?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  // The SVG used preserveAspectRatio="none" over a fixed 1000-unit viewBox, so
  // a wider container stretched every glyph horizontally. Measuring the real
  // width and drawing 1 unit = 1 pixel keeps text at its true proportions.
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  if (rows.length === 0) {
    return <p className="text-body-sm text-on-surface-variant/60">Chưa có dữ liệu.</p>;
  }

  const W = Math.max(320, Math.round(width) || 1000);
  const H = height;
  const padL = 46;
  const padR = 12;
  const padT = 12;
  const padB = 34;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const maxVal = Math.max(
    1,
    ...rows.flatMap((r) => series.map((s) => r[s.key] ?? 0)),
  );
  // Round the axis up to a friendly step.
  const step = niceStep(maxVal / 4);
  const axisMax = step * 4;

  const xAt = (i: number) =>
    padL + (rows.length === 1 ? innerW / 2 : (i / (rows.length - 1)) * innerW);
  const yAt = (v: number) => padT + (1 - v / axisMax) * innerH;

  return (
    <div className="relative w-full" ref={wrapRef}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: "block" }}>
        <defs>
          {series.map((s) => (
            <linearGradient key={s.key} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity={0.25} />
              <stop offset="100%" stopColor={s.color} stopOpacity={0.02} />
            </linearGradient>
          ))}
        </defs>

        {/* horizontal grid + y labels */}
        {[0, 1, 2, 3, 4].map((i) => {
          const v = step * i;
          const y = yAt(v);
          return (
            <g key={i}>
              <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="#f1f3f5" strokeWidth={1} />
              <text x={padL - 10} y={y + 4} textAnchor="end" fontSize={13} fill="#9aa2ad" fontWeight={600}>
                {formatCompact(v)}
              </text>
            </g>
          );
        })}

        {/* series */}
        {series.map((s) => {
          const pts = rows.map((r, i) => [xAt(i), yAt(r[s.key] ?? 0)] as const);
          const line = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
          const area = `${line} L${xAt(rows.length - 1)},${yAt(0)} L${xAt(0)},${yAt(0)} Z`;
          return (
            <g key={s.key}>
              <path d={area} fill={`url(#grad-${s.key})`} />
              <path d={line} fill="none" stroke={s.color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
            </g>
          );
        })}

        {/* x labels — thinned so 30 daily buckets don't collide, and the first
            and last are always kept so the range reads unambiguously. */}
        {labels.map((l, i) => {
          const every = Math.max(1, Math.ceil(labels.length / Math.max(2, Math.floor(innerW / 70))));
          const keep = i === 0 || i === labels.length - 1 || i % every === 0;
          if (!keep) return null;
          // Nudge the edge labels inward so they aren't clipped by the viewBox.
          const anchor = i === 0 ? "start" : i === labels.length - 1 ? "end" : "middle";
          return (
            <text key={i} x={xAt(i)} y={H - 10} textAnchor={anchor} fontSize={12} fill="#6b7280" fontWeight={600}>
              {l}
            </text>
          );
        })}

        {/* hover guide + dots */}
        {hover !== null && (
          <g>
            <line x1={xAt(hover)} y1={padT} x2={xAt(hover)} y2={padT + innerH} stroke="#d1d5db" strokeWidth={1} strokeDasharray="4 4" />
            {series.map((s) => (
              <circle key={s.key} cx={xAt(hover)} cy={yAt(rows[hover][s.key] ?? 0)} r={4.5} fill="#fff" stroke={s.color} strokeWidth={2.5} />
            ))}
          </g>
        )}

        {/* hit areas */}
        {rows.map((_, i) => (
          <rect
            key={i}
            x={xAt(i) - innerW / Math.max(1, rows.length) / 2}
            y={padT}
            width={innerW / Math.max(1, rows.length)}
            height={innerH}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          />
        ))}
      </svg>

      {/* tooltip */}
      {hover !== null && (
        <div
          className="absolute pointer-events-none bg-gray-900 text-white rounded-xl px-3 py-2 shadow-lg text-[13px] z-10"
          style={{
            left: `${(xAt(hover) / W) * 100}%`,
            top: 8,
            transform: "translateX(-50%)",
            whiteSpace: "nowrap",
          }}
        >
          <p className="font-semibold mb-1">{labels[hover]}</p>
          {series.map((s) => (
            <p key={s.key} className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full" style={{ background: s.color }} />
              <span className="text-gray-300">{s.label}</span>
              <span className="font-semibold ml-auto">
                {(rows[hover][s.key] ?? 0).toLocaleString()}{valueSuffix}
              </span>
            </p>
          ))}
        </div>
      )}

      {/* legend */}
      <div className="flex items-center justify-center gap-6 mt-2">
        {series.map((s) => (
          <span key={s.key} className="flex items-center gap-2 text-[13px] text-gray-600">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Grouped bar chart (velocity: committed vs completed) ─────

export function GroupedBarChart({
  labels,
  rows,
  series,
  height = 260,
}: {
  labels: string[];
  rows: Record<string, number>[];
  series: ChartSeries[];
  height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  if (rows.length === 0) {
    return <p className="text-body-sm text-on-surface-variant/60">Chưa có dữ liệu.</p>;
  }

  const W = 1000;
  const H = height;
  const padL = 46;
  const padR = 12;
  const padT = 12;
  const padB = 34;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const maxVal = Math.max(1, ...rows.flatMap((r) => series.map((s) => r[s.key] ?? 0)));
  const step = niceStep(maxVal / 4);
  const axisMax = step * 4;
  const yAt = (v: number) => padT + (1 - v / axisMax) * innerH;

  const groupW = innerW / rows.length;
  const barW = Math.min(28, (groupW * 0.6) / series.length);

  return (
    <div className="relative w-full">
      {/* Same fix as TrendAreaChart: "none" stretched the labels horizontally. */}
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: "block" }}>
        {[0, 1, 2, 3, 4].map((i) => {
          const y = yAt(step * i);
          return (
            <g key={i}>
              <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="#f1f3f5" strokeWidth={1} />
              <text x={padL - 10} y={y + 4} textAnchor="end" fontSize={13} fill="#9aa2ad" fontWeight={600}>
                {formatCompact(step * i)}
              </text>
            </g>
          );
        })}

        {rows.map((r, i) => {
          const cx = padL + groupW * i + groupW / 2;
          const totalW = barW * series.length + 4 * (series.length - 1);
          return (
            <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={padL + groupW * i} y={padT} width={groupW} height={innerH} fill="transparent" />
              {series.map((s, si) => {
                const v = r[s.key] ?? 0;
                const y = yAt(v);
                return (
                  <rect
                    key={s.key}
                    x={cx - totalW / 2 + si * (barW + 4)}
                    y={y}
                    width={barW}
                    height={Math.max(1, padT + innerH - y)}
                    rx={4}
                    fill={s.color}
                    opacity={hover === null || hover === i ? 1 : 0.5}
                  />
                );
              })}
              <text x={cx} y={H - 10} textAnchor="middle" fontSize={13} fill="#6b7280" fontWeight={600}>
                {labels[i]}
              </text>
            </g>
          );
        })}
      </svg>

      {hover !== null && (
        <div
          className="absolute pointer-events-none bg-gray-900 text-white rounded-xl px-3 py-2 shadow-lg text-[13px] z-10"
          style={{
            left: `${((padL + groupW * hover + groupW / 2) / W) * 100}%`,
            top: 8,
            transform: "translateX(-50%)",
            whiteSpace: "nowrap",
          }}
        >
          <p className="font-semibold mb-1">{labels[hover]}</p>
          {series.map((s) => (
            <p key={s.key} className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full" style={{ background: s.color }} />
              <span className="text-gray-300">{s.label}</span>
              <span className="font-semibold ml-auto">{rows[hover][s.key] ?? 0}</span>
            </p>
          ))}
        </div>
      )}

      <div className="flex items-center justify-center gap-6 mt-2">
        {series.map((s) => (
          <span key={s.key} className="flex items-center gap-2 text-[13px] text-gray-600">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

// Rounds a raw step up to 1/2/5 × 10ⁿ so axis labels stay readable.
function niceStep(raw: number) {
  if (raw <= 1) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return nice * mag;
}

function formatCompact(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}k`;
  return String(n);
}
