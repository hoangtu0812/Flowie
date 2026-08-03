import { Icon as AstryxIcon } from "@astryxdesign/core/Icon";
import { materialIcon } from "./materialIcon";

type AstryxIconSize = "xsm" | "sm" | "md" | "lg";

/**
 * Astryx chỉ có 4 bậc icon: xsm 12px, sm 16px, md 20px, lg 24px.
 * Code cũ truyền px tuỳ ý (12, 14, 16, 18, 20, 22, 24, 28, 32, 40) — quy về bậc
 * gần nhất. Đây chính là điều "chuẩn hoá theo design system" nghĩa là: thang đo
 * thu từ 10 giá trị tuỳ tiện xuống 4 token. Cỡ > 24 bị kẹp xuống lg.
 */
function toAstryxSize(px?: number): AstryxIconSize {
  if (px === undefined) return "md";
  if (px <= 13) return "xsm";
  if (px <= 17) return "sm";
  if (px <= 22) return "md";
  return "lg";
}

/**
 * Icon của Flowie — nay render qua Astryx Icon thay vì <span> thô, nên thừa
 * hưởng token màu/cỡ và theme. Giữ nguyên API cũ (`name`, `size` px, `filled`,
 * `title`) để 167 chỗ gọi không phải sửa đồng loạt.
 */
export default function Icon({
  name,
  className,
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
    <AstryxIcon
      icon={materialIcon(name, filled)}
      size={toAstryxSize(size)}
      label={title}
      className={className}
    />
  );
}
