/** Zoom levels the image viewer steps through; 1 is the image fitted to the screen. */
/** VI: Các mức zoom của trình xem ảnh; 1 là ảnh vừa khung màn hình. */
export const ZOOM_LEVELS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4] as const;

/**
 * Next zoom level in `direction` (1 = in, -1 = out), clamped to the ends. A scale between
 * two levels moves to the nearest level on that side, so the steps stay predictable.
 * VI: Mức zoom kế tiếp theo `direction` (1 = phóng to, -1 = thu nhỏ), dừng ở hai đầu. Mức
 * VI: nằm giữa hai bậc sẽ nhảy tới bậc gần nhất phía đó để các bước luôn dễ đoán.
 */
export function stepZoom(scale: number, direction: 1 | -1): number {
   if (direction > 0) return ZOOM_LEVELS.find((level) => level > scale) ?? ZOOM_LEVELS.at(-1)!;
   return [...ZOOM_LEVELS].reverse().find((level) => level < scale) ?? ZOOM_LEVELS[0];
}

/**
 * Index after moving `step` places through `count` images, wrapping at both ends.
 * VI: Chỉ số sau khi đi `step` bước qua `count` ảnh, quay vòng ở hai đầu.
 */
export function wrapIndex(index: number, step: number, count: number): number {
   return count ? (((index + step) % count) + count) % count : 0;
}

/**
 * Scale that fits a `width`×`height` image inside a `boxWidth`×`boxHeight` area without
 * enlarging small images past their natural size.
 * VI: Tỉ lệ để ảnh `width`×`height` vừa trong vùng `boxWidth`×`boxHeight`, không phóng ảnh
 * VI: nhỏ vượt kích thước gốc.
 */
export function fitScale(width: number, height: number, boxWidth: number, boxHeight: number) {
   if (!width || !height || boxWidth <= 0 || boxHeight <= 0) return 1;
   return Math.min(1, boxWidth / width, boxHeight / height);
}
