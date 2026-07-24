// Vòng tròn avatar với chữ cái đầu (không có ảnh thật).
const PALETTE = [
  "bg-primary text-on-primary",
  "bg-tertiary text-on-tertiary",
  "bg-success text-on-primary",
  "bg-secondary text-on-secondary",
];

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export default function Avatar({
  name,
  size = 24,
  title,
}: {
  name?: string;
  size?: number;
  title?: string;
}) {
  const label = (name || "?").trim();
  const initials = label
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("") || "?";
  const cls = PALETTE[hash(label) % PALETTE.length];
  return (
    <span
      title={title ?? label}
      className={`inline-flex items-center justify-center rounded-full border-2 border-surface ${cls}`}
      style={{ width: size, height: size, fontSize: size * 0.42, fontWeight: 600 }}
    >
      {initials}
    </span>
  );
}
