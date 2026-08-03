"use client";

import { useEffect, useRef, useState } from "react";
import { Card } from "@astryxdesign/core/Card";
import { VStack, HStack, StackItem } from "@astryxdesign/core/Layout";
import { Text } from "@astryxdesign/core/Text";
import Icon from "./Icon";

/**
 * NGOẠI LỆ CÓ CHỦ ĐÍCH cho cả file này.
 *
 * Đây là các biểu đồ vẽ bằng SVG thuần — Astryx không có component chart nào.
 * Mọi toạ độ (`x`, `y`, `cx`, `width`, `strokeDasharray`…) đều suy ra từ dữ
 * liệu lúc chạy nên không token hoá được, và chúng là thuộc tính SVG chứ không
 * phải CSS.
 *
 * Cái ĐÃ chuẩn hoá: khung ngoài (StatTile, tooltip, legend) dùng component
 * Astryx, và mọi màu — kể cả màu bên trong SVG — nay lấy từ token `var(--color-*)`
 * thay vì hex hardcode, nên biểu đồ đổi theo dark mode.
 */

/** Chấm màu chú giải: màu đến từ series nên phải đặt lúc chạy. */
function dot(color: string, size: number): React.CSSProperties {
  return { width: size, height: size, borderRadius: "50%", background: color, flexShrink: 0 };
}

/** Tooltip nổi trên biểu đồ — nền/chữ lấy từ token đảo màu của theme. */
const tooltipStyle: React.CSSProperties = {
  position: "absolute",
  pointerEvents: "none",
  zIndex: 10,
  background: "var(--color-background-inverted)",
  color: "var(--color-on-dark)",
  borderRadius: "var(--radius-lg, 12px)",
  padding: "var(--spacing-2) var(--spacing-3)",
  boxShadow: "0 4px 12px var(--color-shadow)",
};

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
    <Card padding={5}>
      <VStack gap={4} hAlign="stretch">
        <Text weight="semibold" color="secondary">
          {title}
        </Text>
        <HStack gap={3} vAlign="end">
          <VStack gap={3}>
            <Text type="display-2" weight="bold">
              {value}
            </Text>
            {delta !== undefined && (
              <HStack gap={1} vAlign="center">
                <Icon name={up ? "trending_up" : "trending_down"} size={18} />
                <Text
                  type="supporting"
                  weight="semibold"
                  color={good ? "accent" : "primary"}>
                  {up ? "+" : ""}
                  {delta.toFixed(2)}%
                </Text>
              </HStack>
            )}
          </VStack>
          {visual && (
            <>
              <StackItem size="fill" />
              {visual}
            </>
          )}
        </HStack>
      </VStack>
    </Card>
  );
}

// ── Bar sparkline ────────────────────────────────────────────

export function BarSparkline({
  values,
  width = 130,
  height = 60,
  color = "var(--color-icon-blue)",
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
  color = "var(--color-icon-purple)",
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
  color = "var(--color-icon-orange)",
  track = "var(--color-track)",
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
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
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
        style={{
          position: "absolute",
          inset: 0,
          display: "grid",
          placeItems: "center",
          fontWeight: 700,
          color,
        }}
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
    return <Text type="supporting">Chưa có dữ liệu.</Text>;
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
    <div style={{ position: "relative", width: "100%" }} ref={wrapRef}>
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
              <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="var(--color-border)" strokeWidth={1} />
              <text x={padL - 10} y={y + 4} textAnchor="end" fontSize={13} fill="var(--color-text-secondary)" fontWeight={600}>
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
            <text key={i} x={xAt(i)} y={H - 10} textAnchor={anchor} fontSize={12} fill="var(--color-text-secondary)" fontWeight={600}>
              {l}
            </text>
          );
        })}

        {/* hover guide + dots */}
        {hover !== null && (
          <g>
            <line x1={xAt(hover)} y1={padT} x2={xAt(hover)} y2={padT + innerH} stroke="var(--color-border-emphasized)" strokeWidth={1} strokeDasharray="4 4" />
            {series.map((s) => (
              <circle key={s.key} cx={xAt(hover)} cy={yAt(rows[hover][s.key] ?? 0)} r={4.5} fill="var(--color-background-surface)" stroke={s.color} strokeWidth={2.5} />
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
          style={{
            ...tooltipStyle,
            left: `${(xAt(hover) / W) * 100}%`,
            top: 8,
            transform: "translateX(-50%)",
            whiteSpace: "nowrap",
          }}
        >
          <Text weight="semibold" color="inherit">{labels[hover]}</Text>
          {series.map((s) => (
            <HStack key={s.key} gap={2} vAlign="center">
              <span style={dot(s.color, 8)} />
              <Text type="supporting" color="inherit">{s.label}</Text>
              <StackItem size="fill" />
              <Text weight="semibold" color="inherit">
                {(rows[hover][s.key] ?? 0).toLocaleString()}{valueSuffix}
              </Text>
            </HStack>
          ))}
        </div>
      )}

      {/* legend */}
      <HStack gap={6} vAlign="center" justify="center">
        {series.map((s) => (
          <HStack key={s.key} gap={2} vAlign="center">
            <span style={dot(s.color, 10)} />
            <Text type="supporting">{s.label}</Text>
          </HStack>
        ))}
      </HStack>
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
    return <Text type="supporting">Chưa có dữ liệu.</Text>;
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
    <div style={{ position: "relative", width: "100%" }}>
      {/* Same fix as TrendAreaChart: "none" stretched the labels horizontally. */}
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: "block" }}>
        {[0, 1, 2, 3, 4].map((i) => {
          const y = yAt(step * i);
          return (
            <g key={i}>
              <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="var(--color-border)" strokeWidth={1} />
              <text x={padL - 10} y={y + 4} textAnchor="end" fontSize={13} fill="var(--color-text-secondary)" fontWeight={600}>
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
              <text x={cx} y={H - 10} textAnchor="middle" fontSize={13} fill="var(--color-text-secondary)" fontWeight={600}>
                {labels[i]}
              </text>
            </g>
          );
        })}
      </svg>

      {hover !== null && (
        <div
          style={{
            ...tooltipStyle,
            left: `${((padL + groupW * hover + groupW / 2) / W) * 100}%`,
            top: 8,
            transform: "translateX(-50%)",
            whiteSpace: "nowrap",
          }}
        >
          <Text weight="semibold" color="inherit">{labels[hover]}</Text>
          {series.map((s) => (
            <HStack key={s.key} gap={2} vAlign="center">
              <span style={dot(s.color, 8)} />
              <Text type="supporting" color="inherit">{s.label}</Text>
              <StackItem size="fill" />
              <Text weight="semibold" color="inherit">{rows[hover][s.key] ?? 0}</Text>
            </HStack>
          ))}
        </div>
      )}

      <HStack gap={6} vAlign="center" justify="center">
        {series.map((s) => (
          <HStack key={s.key} gap={2} vAlign="center">
            <span style={dot(s.color, 10)} />
            <Text type="supporting">{s.label}</Text>
          </HStack>
        ))}
      </HStack>
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
