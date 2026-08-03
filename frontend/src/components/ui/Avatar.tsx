import { Avatar as AstryxAvatar, type AvatarSize } from "@astryxdesign/core/Avatar";

/**
 * Astryx chỉ nhận các cỡ avatar rời rạc, không nhận px tuỳ ý — thang đo là một
 * phần của design system. Code cũ truyền số bất kỳ nên phải bám về bậc gần nhất.
 */
const STEPS = [16, 20, 24, 32, 36, 40, 48, 60, 64, 72, 96, 128, 144, 180] as const;

function snapSize(px: number): AvatarSize {
  let best: (typeof STEPS)[number] = STEPS[0];
  for (const step of STEPS) {
    if (Math.abs(step - px) < Math.abs(best - px)) best = step;
  }
  return best;
}

/**
 * Avatar của Flowie — nay uỷ quyền cho Astryx Avatar.
 *
 * Bản cũ tự sinh chữ cái đầu, tự hash tên ra một trong 4 màu Tailwind, và vẽ
 * bằng <span> + style inline. Astryx Avatar đã làm đúng việc đó bằng token của
 * theme, nên bỏ hết phần tự chế. Giữ API cũ để chỗ gọi không phải sửa.
 */
export default function Avatar({
  name,
  size = 24,
  title,
}: {
  name?: string;
  size?: number;
  title?: string;
}) {
  return <AstryxAvatar name={name || "?"} size={snapSize(size)} tooltip={title ?? true} />;
}
