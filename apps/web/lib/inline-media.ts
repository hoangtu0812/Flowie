export type MediaBounds = { x: number; y: number; width: number; height: number };
export function clampMediaView(bounds: MediaBounds, view: MediaBounds): MediaBounds {
   return {
      ...view,
      x: Math.max(bounds.x, Math.min(bounds.x + bounds.width - view.width, view.x)),
      y: Math.max(bounds.y, Math.min(bounds.y + bounds.height - view.height, view.y)),
   };
}
export function zoomMediaView(bounds: MediaBounds, view: MediaBounds, factor: number): MediaBounds {
   const zoom = Math.max(1, Math.min(8, (bounds.width / view.width) * factor));
   const width = bounds.width / zoom,
      height = bounds.height / zoom;
   return clampMediaView(bounds, {
      x: view.x + (view.width - width) / 2,
      y: view.y + (view.height - height) / 2,
      width,
      height,
   });
}
