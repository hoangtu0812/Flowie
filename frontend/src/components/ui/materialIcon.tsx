import type { ComponentType, SVGProps } from "react";

/**
 * Bọc một glyph Material Symbols thành component có chữ ký giống SVG component.
 *
 * Astryx nhận `IconType` = tên semantic trong registry HOẶC một
 * ComponentType<SVGProps<SVGSVGElement>>. Registry của Astryx chỉ có 26 tên
 * semantic (close, search, calendar…) — không có dashboard / folder / group…
 * mà sidebar Flowie đang dùng. Thay vì kéo thêm một bộ icon SVG nữa, ta bọc
 * font Material Symbols sẵn có lại cho khớp chữ ký.
 *
 * Astryx set size/color trên phần tử bao ngoài; class `.astryx-glyph` để span
 * thừa kế bằng 1em + currentColor (xem globals.css).
 */
export function materialIcon(name: string): ComponentType<SVGProps<SVGSVGElement>> {
  function MaterialGlyph({ className }: SVGProps<SVGSVGElement>) {
    return (
      <span
        className={`material-symbols-outlined astryx-glyph${className ? ` ${className}` : ""}`}
        aria-hidden="true">
        {name}
      </span>
    );
  }
  MaterialGlyph.displayName = `MaterialIcon(${name})`;
  return MaterialGlyph;
}
