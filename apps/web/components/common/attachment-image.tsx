'use client';

import { authenticatedFetch } from '@/lib/workspaces';
import { cn } from '@/lib/utils';
import { useEffect, useState } from 'react';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

/**
 * Attachments are private, and the session cookie is SameSite=Lax — a bare
 * `<img src>` at the API origin would arrive unauthenticated. Fetching the
 * bytes through the same helper the rest of the app uses keeps embedded
 * screenshots working whether or not the API shares the web origin.
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
   const authenticated = src.startsWith(`${api}/attachments/`);
   const [objectUrl, setObjectUrl] = useState<string>();
   const [failed, setFailed] = useState(false);

   useEffect(() => {
      if (!authenticated) return;
      let revoked = false;
      let url: string | undefined;
      setFailed(false);
      void (async () => {
         try {
            const response = await authenticatedFetch(src);
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
   }, [authenticated, src]);

   if (failed) {
      return <span className="text-xs text-muted-foreground">{alt} — image unavailable</span>;
   }

   const resolved = authenticated ? objectUrl : src;
   if (!resolved) {
      return (
         <span className="my-2 block h-32 w-full max-w-md animate-pulse rounded-md bg-accent/50" />
      );
   }

   return (
      // Blob URLs and a private API origin are both outside what next/image
      // can optimise.
      // eslint-disable-next-line @next/next/no-img-element
      <img
         src={resolved}
         alt={alt}
         className={cn('my-2 block max-w-full rounded-md border border-border/60', className)}
      />
   );
}
