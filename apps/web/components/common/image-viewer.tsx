'use client';

import { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, RotateCcw, X, ZoomIn, ZoomOut } from 'lucide-react';
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { fitScale, stepZoom, wrapIndex } from '@/lib/image-viewer';

export type ViewerImage = { src: string; alt: string };

const toolButton =
   'inline-flex size-8 items-center justify-center rounded-md text-white/80 hover:bg-white/10 hover:text-white disabled:opacity-40';

/**
 * Full-screen viewer for the images of one task. Closes on Esc, the close button or a click
 * on the backdrop; ← / → (or the side buttons) move between images when there is more than
 * one; + / − / 0 zoom in, out and reset. A zoomed image is sized in layout rather than with a
 * CSS transform so the area scrolls to every edge. `src` values are the object URLs the page
 * already loaded, so opening the viewer does not download the image again; the skeleton
 * covers the moment until the browser decodes it.
 * VI: Trình xem toàn màn hình cho ảnh của một task. Đóng bằng Esc, nút đóng hoặc click nền;
 * VI: ← / → (hoặc nút hai bên) chuyển ảnh khi có từ 2 ảnh; + / − / 0 để phóng to, thu nhỏ và
 * VI: đặt lại. Ảnh phóng to đổi kích thước trong layout thay vì CSS transform để vùng xem cuộn
 * VI: được tới mọi cạnh. `src` là object URL trang đã tải, nên mở viewer không tải lại ảnh;
 * VI: skeleton che khoảng thời gian trình duyệt đang giải mã ảnh.
 */
export function ImageViewer({
   images,
   initialIndex,
   onClose,
}: {
   images: ViewerImage[];
   initialIndex: number;
   onClose: () => void;
}) {
   const [index, setIndex] = useState(initialIndex);
   const [scale, setScale] = useState(1);
   const [natural, setNatural] = useState<{ width: number; height: number; fit: number }>();
   const stage = useRef<HTMLDivElement>(null);
   const image = images[index];
   const many = images.length > 1;

   function go(step: number) {
      setIndex((current) => wrapIndex(current, step, images.length));
      setScale(1);
      setNatural(undefined);
   }

   return (
      <Dialog open onOpenChange={(open) => !open && onClose()}>
         <DialogContent
            showCloseButton={false}
            aria-describedby={undefined}
            className="flex h-[100dvh] w-screen max-w-none flex-col gap-0 rounded-none border-0 bg-black/90 p-0 text-white sm:max-w-none"
            onKeyDown={(event) => {
               if (many && event.key === 'ArrowLeft') go(-1);
               else if (many && event.key === 'ArrowRight') go(1);
               else if (event.key === '+' || event.key === '=') setScale((s) => stepZoom(s, 1));
               else if (event.key === '-') setScale((s) => stepZoom(s, -1));
               else if (event.key === '0') setScale(1);
               else return;
               event.preventDefault();
            }}
         >
            <div className="flex items-center gap-1 px-3 py-2 text-sm">
               <DialogTitle className="min-w-0 flex-1 truncate text-sm font-medium text-white">
                  {image.alt || 'Image'}
               </DialogTitle>
               {many && (
                  <span className="px-2 tabular-nums text-white/70">
                     {index + 1} / {images.length}
                  </span>
               )}
               <button
                  type="button"
                  className={toolButton}
                  aria-label="Zoom out"
                  title="Zoom out (−)"
                  disabled={scale <= 0.25}
                  onClick={() => setScale((s) => stepZoom(s, -1))}
               >
                  <ZoomOut className="size-4" />
               </button>
               <span className="w-12 text-center tabular-nums text-white/70">
                  {Math.round(scale * 100)}%
               </span>
               <button
                  type="button"
                  className={toolButton}
                  aria-label="Zoom in"
                  title="Zoom in (+)"
                  disabled={scale >= 4}
                  onClick={() => setScale((s) => stepZoom(s, 1))}
               >
                  <ZoomIn className="size-4" />
               </button>
               <button
                  type="button"
                  className={toolButton}
                  aria-label="Reset zoom"
                  title="Reset zoom (0)"
                  disabled={scale === 1}
                  onClick={() => setScale(1)}
               >
                  <RotateCcw className="size-4" />
               </button>
               <a
                  href={image.src}
                  download={image.alt || 'image'}
                  className={toolButton}
                  aria-label="Download image"
                  title="Download image"
               >
                  <Download className="size-4" />
               </a>
               <DialogClose
                  className={toolButton}
                  aria-label="Close image viewer"
                  title="Close (Esc)"
               >
                  <X className="size-4" />
               </DialogClose>
            </div>
            <div
               ref={stage}
               className="relative flex min-h-0 flex-1 overflow-auto p-4"
               onClick={(event) => {
                  if (event.target === event.currentTarget) onClose();
               }}
            >
               {!natural && (
                  <span className="absolute inset-0 m-auto block h-1/2 w-1/2 max-w-xl animate-pulse rounded-md bg-white/10" />
               )}
               {/* eslint-disable-next-line @next/next/no-img-element -- object URLs are outside next/image. */}
               <img
                  key={image.src}
                  src={image.src}
                  alt={image.alt}
                  draggable={false}
                  className="m-auto block max-w-none select-none"
                  style={
                     natural
                        ? {
                             width: natural.width * natural.fit * scale,
                             height: natural.height * natural.fit * scale,
                          }
                        : { visibility: 'hidden', width: 0, height: 0 }
                  }
                  onLoad={(event) => {
                     const box = stage.current;
                     const { naturalWidth: width, naturalHeight: height } = event.currentTarget;
                     setNatural({
                        width,
                        height,
                        fit: fitScale(
                           width,
                           height,
                           (box?.clientWidth ?? 0) - 32,
                           (box?.clientHeight ?? 0) - 32
                        ),
                     });
                  }}
               />
               {many && (
                  <>
                     <button
                        type="button"
                        className={`${toolButton} fixed top-1/2 left-3 size-10 -translate-y-1/2 bg-black/40`}
                        aria-label="Previous image"
                        title="Previous image (←)"
                        onClick={() => go(-1)}
                     >
                        <ChevronLeft className="size-5" />
                     </button>
                     <button
                        type="button"
                        className={`${toolButton} fixed top-1/2 right-3 size-10 -translate-y-1/2 bg-black/40`}
                        aria-label="Next image"
                        title="Next image (→)"
                        onClick={() => go(1)}
                     >
                        <ChevronRight className="size-5" />
                     </button>
                  </>
               )}
            </div>
         </DialogContent>
      </Dialog>
   );
}
