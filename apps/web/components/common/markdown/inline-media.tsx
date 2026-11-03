'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Button } from '@astryxdesign/core/Button';
import { Text } from '@astryxdesign/core/Text';
import { ZoomIn, ZoomOut, RotateCcw, Minimize2 } from 'lucide-react';
import { useMessages } from '@/features/shared/use-messages';
import { clampMediaView, zoomMediaView, type MediaBounds } from '@/lib/inline-media';

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
 * Changes the SVG viewport rather than transforming a floating overlay: the expanded frame
 * remains in document flow. Pointer coordinates use the initial inverse CTM, so panning
 * stays stable as viewBox changes; clamping keeps every zoomed edge reachable without gaps.
 * VI: Đổi viewport SVG thay vì biến đổi lớp nổi: khung mở rộng vẫn nằm trong luồng tài liệu.
 * Tọa độ con trỏ dùng CTM nghịch đảo ban đầu nên pan ổn định khi viewBox đổi; clamp cho xem
 * được mọi mép ảnh đã phóng mà không kéo lộ khoảng trống ngoài ảnh.
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
   const [view, setView] = useState(bounds);
   const frame = useRef<SVGSVGElement>(null);
   const expandButton = useRef<HTMLButtonElement>(null);
   const drag = useRef<
      { pointer: number; point: DOMPoint; inverse: DOMMatrix; view: MediaBounds } | undefined
   >(undefined);
   const zoom = bounds.width / view.width;
   const changeZoom = (factor: number) =>
      setView((current) => zoomMediaView(bounds, current, factor));
   const collapse = () => {
      setExpanded(false);
      setView(bounds);
      drag.current = undefined;
      requestAnimationFrame(() => expandButton.current?.focus());
   };
   const svg = (
      <svg
         ref={frame}
         role="img"
         aria-label={label}
         tabIndex={expanded ? 0 : undefined}
         viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}
         width={bounds.width}
         height={bounds.height}
         className={
            expanded
               ? 'block h-96 w-full touch-none cursor-grab active:cursor-grabbing rounded border border-border'
               : 'block h-auto w-full max-h-80'
         }
         onKeyDown={(event) => {
            if (!expanded) return;
            if (
               ['+', '=', '-', '0', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(
                  event.key
               )
            )
               event.preventDefault();
            if (event.key === '+' || event.key === '=') changeZoom(1.25);
            if (event.key === '-') changeZoom(0.8);
            if (event.key === '0') setView(bounds);
            const dx = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
            const dy = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
            if (dx || dy)
               setView((current) =>
                  clampMediaView(bounds, {
                     ...current,
                     x: current.x + (dx * current.width) / 5,
                     y: current.y + (dy * current.height) / 5,
                  })
               );
         }}
         onPointerDown={(event) => {
            if (!expanded || event.button !== 0) return;
            const matrix = event.currentTarget.getScreenCTM();
            if (!matrix) return;
            const inverse = matrix.inverse();
            drag.current = {
               pointer: event.pointerId,
               point: new DOMPoint(event.clientX, event.clientY).matrixTransform(inverse),
               inverse,
               view,
            };
            event.currentTarget.setPointerCapture(event.pointerId);
            event.currentTarget.focus();
            event.preventDefault();
         }}
         onPointerMove={(event) => {
            const initial = drag.current;
            if (!initial || initial.pointer !== event.pointerId) return;
            const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(
               initial.inverse
            );
            setView(
               clampMediaView(bounds, {
                  ...initial.view,
                  x: initial.view.x - (point.x - initial.point.x),
                  y: initial.view.y - (point.y - initial.point.y),
               })
            );
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
         {children}
      </svg>
   );
   return (
      <VStack gap={2} data-media-expanded={String(expanded)} className="my-2 min-w-0 w-full">
         {expanded ? (
            <>
               <HStack gap={1} wrap="wrap">
                  <Button
                     size="sm"
                     label={tx('Zoom in')}
                     icon={<ZoomIn />}
                     isDisabled={zoom >= 8}
                     onClick={() => changeZoom(1.25)}
                  />
                  <Button
                     size="sm"
                     label={tx('Zoom out')}
                     icon={<ZoomOut />}
                     isDisabled={zoom <= 1}
                     onClick={() => changeZoom(0.8)}
                  />
                  <Text type="supporting" aria-live="polite">
                     {Math.round(zoom * 100)}%
                  </Text>
                  <Button
                     size="sm"
                     label={tx('Reset view')}
                     icon={<RotateCcw />}
                     onClick={() => setView(bounds)}
                  />
                  <Button
                     size="sm"
                     label={tx('Collapse')}
                     icon={<Minimize2 />}
                     onClick={collapse}
                  />
               </HStack>
               {svg}
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
                  setView(bounds);
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
