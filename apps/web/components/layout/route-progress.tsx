'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

/**
 * A navigation in the App Router keeps the current page on screen while the
 * next one is fetched, which reads as the app freezing on click. This bar is
 * the missing feedback: it starts on any in-app link click and completes when
 * the pathname actually changes.
 */
export function RouteProgress() {
   const pathname = usePathname();
   const [progress, setProgress] = useState(0);

   // Arrival: finish the bar, but only if a navigation was in flight.
   useEffect(() => {
      setProgress((current) => (current > 0 ? 100 : 0));
   }, [pathname]);

   useEffect(() => {
      if (progress !== 100) return;
      const timer = setTimeout(() => setProgress(0), 250);
      return () => clearTimeout(timer);
   }, [progress]);

   // Creep forward while waiting so the bar never looks stuck, and never
   // reach the end before the page does.
   useEffect(() => {
      if (progress === 0 || progress >= 90) return;
      const timer = setTimeout(
         () => setProgress((current) => Math.min(current + (90 - current) / 4, 90)),
         200
      );
      return () => clearTimeout(timer);
   }, [progress]);

   useEffect(() => {
      const onClick = (event: MouseEvent) => {
         if (
            event.defaultPrevented ||
            event.button !== 0 ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey
         ) {
            return;
         }
         const anchor = (event.target as HTMLElement | null)?.closest('a');
         if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return;
         const href = anchor.getAttribute('href');
         if (!href || href.startsWith('#')) return;
         const destination = new URL(anchor.href, window.location.href);
         // Same page, external site or a pure hash: nothing is being loaded.
         if (destination.origin !== window.location.origin) return;
         if (destination.pathname === window.location.pathname) return;
         setProgress(20);
      };
      document.addEventListener('click', onClick);
      return () => document.removeEventListener('click', onClick);
   }, []);

   if (progress === 0) return null;

   return (
      <div
         aria-hidden
         className="fixed inset-x-0 top-0 z-[100] h-0.5 bg-primary transition-all duration-200 ease-out"
         style={{ width: `${progress}%`, opacity: progress === 100 ? 0 : 1 }}
      />
   );
}
