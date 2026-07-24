export default function Icon({
  name,
  className = "",
  filled = false,
  size,
  title,
}: {
  name: string;
  className?: string;
  filled?: boolean;
  size?: number;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={`material-symbols-outlined ${filled ? "filled" : ""} ${className}`}
      style={size ? { fontSize: size } : undefined}
    >
      {name}
    </span>
  );
}
