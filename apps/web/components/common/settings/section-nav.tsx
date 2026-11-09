'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import { cn } from '@/lib/utils';

export type SettingsSectionLink = { id: string; label: string; level: 2 | 3 };

/** Pages with fewer headings than this get no navigation. */
/** VI: Trang có ít tiêu đề hơn số này thì không có mục lục. */
export const MIN_SETTINGS_SECTIONS = 3;

// A heading counts as the current section once its top passes this far below the top of the
// scroll area; it matches the headings' scroll margin plus room for the sticky bar.
// VI: Một tiêu đề được coi là section đang xem khi mép trên của nó vượt qua vị trí cách đỉnh vùng
// VI: cuộn chừng này; khớp với scroll margin của tiêu đề cộng chỗ cho thanh dính.
const ACTIVE_OFFSET = 96;

const labelOf = (heading: Element) => (heading.textContent ?? '').trim().replace(/\s*\(\d+\)$/, '');

const slugOf = (label: string) =>
   label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'section';

/**
 * Lists the h2/h3 headings rendered in a settings page body, in document order.
 * Headings inside dialogs, hidden headings and empty ones are skipped. A heading without an id
 * gets a slug of its label once, so deep links keep working while counts such as "(19)" in the
 * heading change; the trailing count is also left out of the label.
 * VI: Liệt kê các tiêu đề h2/h3 trong thân một trang cài đặt, theo thứ tự trong tài liệu.
 * VI: Bỏ tiêu đề trong hộp thoại, tiêu đề bị ẩn và tiêu đề rỗng. Tiêu đề chưa có id được gán một
 * VI: lần slug của nhãn, để deep link vẫn đúng khi số đếm như "(19)" trong tiêu đề thay đổi; số
 * VI: đếm ở cuối cũng không đưa vào nhãn.
 */
function collectSections(content: HTMLElement): SettingsSectionLink[] {
   const links: SettingsSectionLink[] = [];
   const used = new Set<string>();
   content.querySelectorAll<HTMLElement>('h2, h3').forEach((heading) => {
      if (heading.closest('dialog, [role="dialog"]') || !heading.getClientRects().length) return;
      const label = labelOf(heading);
      if (!label) return;
      if (!heading.id) {
         const base = slugOf(label);
         let id = base;
         for (let n = 2; used.has(id) || document.getElementById(id); n += 1) id = `${base}-${n}`;
         heading.id = id;
      }
      used.add(heading.id);
      links.push({ id: heading.id, label, level: heading.tagName === 'H3' ? 3 : 2 });
   });
   return links;
}

const sameLinks = (a: SettingsSectionLink[], b: SettingsSectionLink[]) =>
   a.length === b.length &&
   a.every(
      (link, i) => link.id === b[i].id && link.label === b[i].label && link.level === b[i].level
   );

/**
 * Tracks the sections of a settings page and the one being read.
 * A MutationObserver rescans the body because many pages render sections after their data
 * loads. The current section is the last heading scrolled past the top of the scroll area. A
 * `#section` in the URL is honoured once, as soon as that heading exists. While a click-started
 * smooth scroll runs the highlight stays on the clicked section, so a section near the end of the
 * page that cannot reach the top is still shown as selected.
 * VI: Theo dõi các section của một trang cài đặt và section đang được đọc.
 * VI: MutationObserver quét lại thân trang vì nhiều trang chỉ hiện section sau khi tải dữ liệu.
 * VI: Section đang xem là tiêu đề cuối cùng đã cuộn qua đỉnh vùng cuộn. `#section` trên URL được
 * VI: áp dụng một lần, ngay khi tiêu đề đó xuất hiện. Trong lúc cuộn mượt do bấm, mục được bấm
 * VI: vẫn được tô sáng, để section gần cuối trang không cuộn lên được tới đỉnh vẫn hiện là đã chọn.
 */
export function useSettingsSections(
   contentRef: RefObject<HTMLElement | null>,
   scrollRef: RefObject<HTMLElement | null>
) {
   const [links, setLinks] = useState<SettingsSectionLink[]>([]);
   const [activeId, setActiveId] = useState<string>();
   const lockedRef = useRef(false);

   useEffect(() => {
      const content = contentRef.current;
      if (!content) return;
      let frame = 0;
      let jumped = false;
      const scan = () => {
         frame = 0;
         const next = collectSections(content);
         setLinks((current) => (sameLinks(current, next) ? current : next));
         const hash = decodeURIComponent(window.location.hash.slice(1));
         const target = !jumped && hash ? document.getElementById(hash) : null;
         if (target && content.contains(target)) {
            jumped = true;
            target.scrollIntoView({ block: 'start' });
         }
      };
      const schedule = () => {
         if (!frame) frame = requestAnimationFrame(scan);
      };
      scan();
      const observer = new MutationObserver(schedule);
      observer.observe(content, { childList: true, subtree: true, characterData: true });
      return () => {
         observer.disconnect();
         cancelAnimationFrame(frame);
      };
   }, [contentRef]);

   useEffect(() => {
      const scroller = scrollRef.current;
      if (!scroller || !links.length) return;
      let frame = 0;
      const update = () => {
         frame = 0;
         if (lockedRef.current) return;
         const limit = scroller.getBoundingClientRect().top + ACTIVE_OFFSET;
         let current = links[0].id;
         for (const link of links) {
            const heading = document.getElementById(link.id);
            if (heading && heading.getBoundingClientRect().top <= limit) current = link.id;
         }
         setActiveId(current);
      };
      const onScroll = () => {
         if (!frame) frame = requestAnimationFrame(update);
      };
      update();
      scroller.addEventListener('scroll', onScroll, { passive: true });
      return () => {
         scroller.removeEventListener('scroll', onScroll);
         cancelAnimationFrame(frame);
      };
   }, [links, scrollRef]);

   function select(id: string) {
      const heading = document.getElementById(id);
      const scroller = scrollRef.current;
      if (!heading) return;
      setActiveId(id);
      lockedRef.current = true;
      const unlock = () => {
         lockedRef.current = false;
         scroller?.removeEventListener('scrollend', unlock);
      };
      scroller?.addEventListener('scrollend', unlock);
      // Browsers without `scrollend` (and scrolls too short to fire it) unlock after this delay.
      // VI: Trình duyệt chưa có `scrollend` (và lần cuộn quá ngắn không phát sự kiện) mở khoá sau
      // VI: khoảng thời gian này.
      window.setTimeout(unlock, 1000);
      heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
      window.history.replaceState(window.history.state, '', `#${id}`);
   }

   return { links, activeId, select };
}

/**
 * "On this page" navigation for a settings page: a sticky rail beside the content from the xl
 * breakpoint, and a sticky, horizontally scrolling bar above the content below it. Only one
 * variant is displayed at a time, so only one navigation landmark is exposed.
 * VI: Mục lục "On this page" của một trang cài đặt: cột dính bên cạnh nội dung từ breakpoint xl,
 * VI: và thanh dính cuộn ngang phía trên nội dung khi nhỏ hơn. Mỗi lúc chỉ hiện một biến thể nên
 * VI: chỉ có một landmark điều hướng.
 */
export function SettingsSectionNav({
   links,
   activeId,
   select,
   variant,
}: ReturnType<typeof useSettingsSections> & { variant: 'rail' | 'bar' }) {
   if (links.length < MIN_SETTINGS_SECTIONS) return null;
   const items = links.map((link) => {
      const active = link.id === activeId;
      return (
         <li key={link.id} className={variant === 'bar' ? 'shrink-0' : undefined}>
            <a
               href={`#${link.id}`}
               aria-current={active ? 'location' : undefined}
               onClick={(event) => {
                  event.preventDefault();
                  select(link.id);
               }}
               className={cn(
                  'text-sm transition-colors',
                  variant === 'rail'
                     ? cn(
                          '-ml-px block truncate border-l-2 py-1',
                          link.level === 3 ? 'pl-6' : 'pl-3',
                          active
                             ? 'border-primary font-medium text-foreground'
                             : 'border-transparent text-muted-foreground hover:text-foreground'
                       )
                     : cn(
                          'block whitespace-nowrap rounded-md px-2.5 py-1',
                          active
                             ? 'bg-accent text-foreground'
                             : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                       )
               )}
            >
               {link.label}
            </a>
         </li>
      );
   });
   return variant === 'rail' ? (
      <nav aria-label="On this page" className="hidden w-52 shrink-0 xl:block">
         <div className="sticky top-10">
            <p className="mb-2 text-xs font-medium text-muted-foreground">On this page</p>
            <ul className="flex flex-col border-l">{items}</ul>
         </div>
      </nav>
   ) : (
      <nav
         aria-label="On this page"
         className="sticky top-0 z-10 -mx-6 mt-6 border-b bg-background/95 px-6 py-2 backdrop-blur xl:hidden"
      >
         <ul className="flex gap-1 overflow-x-auto">{items}</ul>
      </nav>
   );
}
