import type { ComponentType, SVGProps } from "react";

/**
 * Bọc một glyph Material Symbols thành component có chữ ký giống SVG component.
 *
 * Astryx nhận `IconType` = tên semantic trong registry HOẶC một
 * ComponentType<SVGProps<SVGSVGElement>>. Registry của Astryx chỉ có 26 tên
 * semantic (close, search, calendar…) — không phủ được 68 icon Flowie đang
 * dùng. Thay vì kéo thêm một bộ icon SVG nữa rồi map tay 68 cái, ta bọc font
 * Material Symbols sẵn có lại cho khớp chữ ký.
 *
 * Astryx set size/color trên phần tử bao ngoài; class `.astryx-glyph` để span
 * thừa kế bằng 1em + currentColor (xem globals.css).
 */

// Cache theo tên: nếu mỗi lần render lại tạo một component mới thì React coi
// đó là type khác nhau và unmount/remount cả cây con — vừa chậm vừa mất state.
const cache = new Map<string, ComponentType<SVGProps<SVGSVGElement>>>();

export function materialIcon(
  name: string,
  filled = false,
): ComponentType<SVGProps<SVGSVGElement>> {
  const key = `${name}|${filled}`;
  const hit = cache.get(key);
  if (hit) return hit;

  function MaterialGlyph({ className }: SVGProps<SVGSVGElement>) {
    return (
      <span
        className={[
          "material-symbols-outlined",
          "astryx-glyph",
          filled ? "filled" : "",
          className ?? "",
        ]
          .filter(Boolean)
          .join(" ")}
        aria-hidden="true">
        {name}
      </span>
    );
  }
  MaterialGlyph.displayName = `MaterialIcon(${name}${filled ? ":filled" : ""})`;

  cache.set(key, MaterialGlyph);
  return MaterialGlyph;
}
