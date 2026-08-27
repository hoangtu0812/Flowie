'use client';

import { useEffect } from 'react';

/**
 * Elements that legitimately hold the page non-interactive while they are on
 * screen. If none of these exist, nothing should be suppressing input.
 */
const OPEN_LAYER_SELECTOR = [
   '[data-radix-popper-content-wrapper]',
   '[role="dialog"][data-state="open"]',
   '[role="alertdialog"][data-state="open"]',
   '[role="menu"][data-state="open"]',
   '[role="listbox"][data-state="open"]',
].join(',');

/**
 * Radix disables pointer events on `document.body` while a modal layer is
 * open and restores the value it recorded when that layer mounted. The
 * recorded value is module-global, so overlapping layers — a menu item that
 * opens a dialog, one dialog handing off to another — can restore `none`
 * instead of the original, leaving the whole page unclickable with no visible
 * cause and no way out but a reload.
 *
 * This watches for input that reaches the document while the body is
 * suppressed and no layer is open, and gives interaction back. Events still
 * arrive here in that state: hit testing skips the body, so `<html>` becomes
 * the target and the event bubbles to the document as usual.
 */
export function BodyInteractionGuard() {
   useEffect(() => {
      const restore = () => {
         if (document.body.style.pointerEvents !== 'none') return;
         if (document.querySelector(OPEN_LAYER_SELECTOR)) return;
         document.body.style.pointerEvents = '';
      };
      document.addEventListener('pointerdown', restore, true);
      document.addEventListener('contextmenu', restore, true);
      document.addEventListener('keydown', restore, true);
      return () => {
         document.removeEventListener('pointerdown', restore, true);
         document.removeEventListener('contextmenu', restore, true);
         document.removeEventListener('keydown', restore, true);
      };
   }, []);

   return null;
}
