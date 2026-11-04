'use client';

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Button } from '@astryxdesign/core/Button';
import { Text } from '@astryxdesign/core/Text';
import { ZoomIn, ZoomOut, RotateCcw, Minimize2 } from 'lucide-react';
import { useMessages } from '@/features/shared/use-messages';
import type { MediaBounds } from '@/lib/inline-media';

const messages = {
   'Expand {name}': 'Mở rộng {name}',
   'Zoom in': 'Phóng to',
   'Zoom out': 'Thu nhỏ',
   'Reset view': 'Đặt lại',
   'Collapse': 'Thu gọn',
   'Drag to pan. Arrow keys move; + / − zoom; 0 resets.':
      'Kéo để di chuyển. Phím mũi tên di chuyển; + / − phóng/thu; 0 đặt lại.',
   'Loading image…': 'Đang tải ảnh…',
   'Image unavailable.': 'Không tải được ảnh.',
   'Image': 'Ảnh',
} as const;

/**
 * Horizontal overflow belongs to the media; vertical movement belongs to the document.
 * The SVG always retains its complete viewBox, so zoom increases layout height instead of
 * clipping a taller drawing. Numeric SVG dimensions come from measured width/source ratio.
 * VI: Tràn ngang thuộc vùng ảnh; di chuyển dọc thuộc tài liệu. SVG luôn giữ viewBox đầy đủ,
 * nên zoom tăng chiều cao layout thay vì cắt hình dài. Kích thước SVG lấy từ chiều rộng đo
 * được và tỷ lệ nguồn.
 */
export function InlineMedia({
   label,
   bounds,
   children,
}: {
   label: string;
   bounds: MediaBounds;
   children: ReactNode;
}) {
   const tx = useMessages(messages);
   const [expanded, setExpanded] = useState(false);
   const [zoom, setZoom] = useState(1);
   const [width, setWidth] = useState(bounds.width);
   const frame = useRef<HTMLDivElement>(null);
   const expandButton = useRef<HTMLButtonElement>(null);
   const drag = useRef<
      | {
           pointer: number;
           x: number;
           y: number;
           left: number;
           top: number;
           scroll: HTMLElement | null;
        }
      | undefined
   >(undefined);
   useLayoutEffect(() => {
      const element = frame.current;
      if (!element) return;
      setWidth(element.clientWidth || bounds.width);
      const observer = new ResizeObserver(() => setWidth(element.clientWidth || bounds.width));
      observer.observe(element);
      return () => observer.disconnect();
   }, [bounds.width, expanded]);
   const verticalScroller = () => {
      let element = frame.current?.parentElement ?? null;
      while (element) {
         if (
            /(auto|scroll)/.test(getComputedStyle(element).overflowY) &&
            element.scrollHeight > element.clientHeight
         )
            return element;
         element = element.parentElement;
      }
      return null;
   };
   const moveVertical = (scroll: HTMLElement | null, top: number) => {
      if (scroll) scroll.scrollTop = top;
      else window.scrollTo({ top, behavior: 'instant' });
   };
   const reset = () => {
      setZoom(1);
      if (frame.current) frame.current.scrollLeft = 0;
   };
   const svg = (
      <svg
         role="img"
         aria-label={label}
         viewBox={`${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`}
         width={expanded ? width * zoom : bounds.width}
         height={expanded ? (width * zoom * bounds.height) / bounds.width : bounds.height}
         className={expanded ? 'block max-w-none shrink-0' : 'block h-auto w-full'}
      >
         {children}
      </svg>
   );
   return (
      <VStack gap={2} data-media-expanded={String(expanded)} className="my-2 min-w-0 w-full">
         {expanded ? (
            <>
               <HStack gap={1} wrap="wrap" className="sticky top-0 z-10 bg-background">
                  <Button
                     size="sm"
                     label={tx('Zoom in')}
                     icon={<ZoomIn />}
                     isDisabled={zoom >= 8}
                     onClick={() => setZoom((z) => Math.min(8, z * 1.25))}
                  />
                  <Button
                     size="sm"
                     label={tx('Zoom out')}
                     icon={<ZoomOut />}
                     isDisabled={zoom <= 1}
                     onClick={() => setZoom((z) => Math.max(1, z * 0.8))}
                  />
                  <Text type="supporting" aria-live="polite">
                     {Math.round(zoom * 100)}%
                  </Text>
                  <Button size="sm" label={tx('Reset view')} icon={<RotateCcw />} onClick={reset} />
                  <Button
                     size="sm"
                     label={tx('Collapse')}
                     icon={<Minimize2 />}
                     onClick={() => {
                        reset();
                        setExpanded(false);
                        drag.current = undefined;
                        requestAnimationFrame(() =>
                           expandButton.current?.focus({ preventScroll: true })
                        );
                     }}
                  />
               </HStack>
               <VStack
                  ref={frame}
                  gap={0}
                  role="region"
                  aria-label={label}
                  tabIndex={0}
                  data-media-scroll="true"
                  className="block w-full min-w-0 overflow-x-auto touch-none cursor-grab active:cursor-grabbing rounded border border-border"
                  onKeyDown={(event) => {
                     if (
                        ![
                           '+',
                           '=',
                           '-',
                           '0',
                           'ArrowLeft',
                           'ArrowRight',
                           'ArrowUp',
                           'ArrowDown',
                        ].includes(event.key)
                     )
                        return;
                     event.preventDefault();
                     if (event.key === '+' || event.key === '=')
                        setZoom((z) => Math.min(8, z * 1.25));
                     if (event.key === '-') setZoom((z) => Math.max(1, z * 0.8));
                     if (event.key === '0') reset();
                     if (event.key === 'ArrowLeft') event.currentTarget.scrollLeft -= width / 5;
                     if (event.key === 'ArrowRight') event.currentTarget.scrollLeft += width / 5;
                     if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                        const scroll = verticalScroller();
                        moveVertical(
                           scroll,
                           (scroll?.scrollTop ?? window.scrollY) +
                              ((event.key === 'ArrowUp' ? -1 : 1) * window.innerHeight) / 5
                        );
                     }
                  }}
                  onPointerDown={(event) => {
                     if (event.button !== 0) return;
                     const scroll = verticalScroller();
                     drag.current = {
                        pointer: event.pointerId,
                        x: event.clientX,
                        y: event.clientY,
                        left: event.currentTarget.scrollLeft,
                        top: scroll?.scrollTop ?? window.scrollY,
                        scroll,
                     };
                     event.currentTarget.setPointerCapture(event.pointerId);
                     event.currentTarget.focus({ preventScroll: true });
                     event.preventDefault();
                  }}
                  onPointerMove={(event) => {
                     const start = drag.current;
                     if (!start || start.pointer !== event.pointerId) return;
                     event.currentTarget.scrollLeft = start.left - (event.clientX - start.x);
                     moveVertical(start.scroll, start.top - (event.clientY - start.y));
                  }}
                  onPointerUp={() => {
                     drag.current = undefined;
                  }}
                  onPointerCancel={() => {
                     drag.current = undefined;
                  }}
                  onLostPointerCapture={() => {
                     drag.current = undefined;
                  }}
               >
                  {svg}
               </VStack>
               <Text type="supporting">
                  {tx('Drag to pan. Arrow keys move; + / − zoom; 0 resets.')}
               </Text>
            </>
         ) : (
            <button
               ref={expandButton}
               type="button"
               aria-label={tx('Expand {name}', { name: label })}
               className="block w-full max-w-full cursor-zoom-in rounded text-left focus-visible:ring-2 focus-visible:ring-primary"
               onClick={() => {
                  reset();
                  setExpanded(true);
               }}
            >
               {svg}
            </button>
         )}
      </VStack>
   );
}

export function InlineDocumentImage({ src, alt }: { src: string; alt: string }) {
   const tx = useMessages(messages);
   const [natural, setNatural] = useState<MediaBounds>();
   const [failed, setFailed] = useState(false);
   useEffect(() => {
      let active = true;
      setNatural(undefined);
      setFailed(false);
      const image = new window.Image();
      image.onload = () => {
         if (active)
            setNatural({
               x: 0,
               y: 0,
               width: image.naturalWidth || 300,
               height: image.naturalHeight || 150,
            });
      };
      image.onerror = () => {
         if (active) setFailed(true);
      };
      image.src = src;
      return () => {
         active = false;
         image.onload = null;
         image.onerror = null;
      };
   }, [src]);
   if (failed) return <Text>{tx('Image unavailable.')}</Text>;
   if (!natural) return <Text role="status">{tx('Loading image…')}</Text>;
   return (
      <InlineMedia key={src} label={alt || tx('Image')} bounds={natural}>
         <image href={src} width={natural.width} height={natural.height} />
      </InlineMedia>
   );
}
