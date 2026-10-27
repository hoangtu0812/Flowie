'use client';

import { attachmentIdFromUrl } from '@/lib/attachment-url';
import { attachmentPreviewUrl } from '@/lib/attachments';
import { authenticatedFetch } from '@/lib/workspaces';
import { cn } from '@/lib/utils';
import { ImageViewer, type ViewerImage } from '@/components/common/image-viewer';
import { useEffect, useRef, useState } from 'react';

/**
 * Attachments are private, and the session cookie is SameSite=Lax — a bare
 * `<img src>` at the API origin would arrive unauthenticated. Fetching the
 * bytes through the same helper the rest of the app uses keeps embedded
 * screenshots working whether or not the API shares the web origin. Stored
 * links may name an older host or base path, so the bytes always come from the
 * current API by attachment id.
 * VI: Đính kèm là riêng tư và cookie phiên là SameSite=Lax — `<img src>` trần
 * tới origin API sẽ không kèm đăng nhập. Tải ảnh qua cùng helper với phần còn
 * lại của app giúp ảnh nhúng hiển thị dù API có chung origin với web hay
 * không. Link đã lưu có thể mang host hoặc base path cũ, nên ảnh luôn được tải
 * từ API hiện tại theo id đính kèm.
 */
export function AttachmentImage({
   src,
   alt,
   className,
}: {
   src: string;
   alt: string;
   className?: string;
}) {
   const attachmentId = attachmentIdFromUrl(src);
   const authenticated = attachmentId !== undefined;
   const target = attachmentId ? attachmentPreviewUrl(attachmentId) : src;
   const [objectUrl, setObjectUrl] = useState<string>();
   const [failed, setFailed] = useState(false);
   const [gallery, setGallery] = useState<{ images: ViewerImage[]; index: number }>();
   const image = useRef<HTMLImageElement>(null);

   useEffect(() => {
      if (!authenticated) return;
      let revoked = false;
      let url: string | undefined;
      setFailed(false);
      void (async () => {
         try {
            const response = await authenticatedFetch(target);
            if (!response.ok) throw new Error('Could not load the image.');
            url = URL.createObjectURL(await response.blob());
            if (revoked) {
               URL.revokeObjectURL(url);
               return;
            }
            setObjectUrl(url);
         } catch {
            if (!revoked) setFailed(true);
         }
      })();
      return () => {
         revoked = true;
         if (url) URL.revokeObjectURL(url);
         setObjectUrl(undefined);
      };
   }, [authenticated, target]);

   if (failed) {
      return <span className="text-xs text-muted-foreground">{alt} — image unavailable</span>;
   }

   const resolved = authenticated ? objectUrl : src;
   if (!resolved) {
      return (
         <span className="my-2 block h-32 w-full max-w-md animate-pulse rounded-md bg-accent/50" />
      );
   }

   // The gallery is every loaded image inside the nearest `[data-image-gallery]` (a task's
   // description and comments), in page order; outside one, the image is viewed alone.
   // VI: Bộ ảnh là mọi ảnh đã tải trong `[data-image-gallery]` gần nhất (mô tả và comment của
   // VI: task), theo thứ tự trên trang; nằm ngoài vùng đó thì chỉ xem riêng ảnh này.
   function openViewer() {
      const own = image.current;
      const nodes = own?.closest('[data-image-gallery]')?.querySelectorAll('img[data-gallery-src]');
      const elements = nodes?.length ? Array.from(nodes as NodeListOf<HTMLImageElement>) : [own];
      const images = elements.flatMap((element) =>
         element ? [{ src: element.dataset.gallerySrc ?? element.src, alt: element.alt }] : []
      );
      setGallery({ images, index: Math.max(0, elements.indexOf(own)) });
   }

   return (
      <>
         <button
            type="button"
            className="block max-w-full cursor-zoom-in rounded-md text-left"
            aria-label={`Open ${alt || 'image'} in viewer`}
            onClick={openViewer}
         >
            {/* Blob URLs and a private API origin are both outside what next/image can optimise. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
               ref={image}
               src={resolved}
               alt={alt}
               data-gallery-src={resolved}
               className={cn('my-2 block max-w-full rounded-md border border-border/60', className)}
            />
         </button>
         {gallery && (
            <ImageViewer
               images={gallery.images}
               initialIndex={gallery.index}
               onClose={() => setGallery(undefined)}
            />
         )}
      </>
   );
}
