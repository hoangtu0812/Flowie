'use client';

import {
   useEffect,
   useLayoutEffect,
   useRef,
   useState,
   type DragEvent,
   type ReactNode,
} from 'react';
import { Text } from '@astryxdesign/core/Text';
import { folderLabel } from '@/lib/document-tree';
import {
   documentDropReason,
   documentMoveConflict,
   type MoveSource,
} from '@/lib/document-tree-move';
import { useMessages } from '@/features/shared/use-messages';
import { sourceFolder, targetName, type TreeTarget } from './document-tree-actions';
import type { ProjectTree } from './project-docs-api';
import { messages } from './messages.vi';

const DRAG_TYPE = 'application/x-flowie-docs-move';
const HOVER_DELAY = 600;
const SCROLL_EDGE = 40;
const SCROLL_SPEED = 12;

export function treeTarget(tree: ProjectTree, id: string): TreeTarget | undefined {
   const folder = tree.folders.find((item) => item.id === id && item.kind !== 'project');
   if (folder) return { kind: 'folder', value: folder };
   const document = tree.documents.find((item) => item.id === id && !item.linked);
   if (document) return { kind: 'document', value: document };
   const file = tree.files.find((item) => item.id === id);
   if (file) return { kind: 'file', value: file };
}

export const moveSource = (target: TreeTarget): MoveSource => ({
   id: target.value.id,
   kind: target.kind,
   folderId: sourceFolder(target),
});
const rowAt = (target: EventTarget | null) =>
   target instanceof Element ? target.closest<HTMLElement>('[data-tree-id]') : null;
const paint = (row: HTMLElement) => row.querySelector<HTMLElement>('.astryx-tree-list-item');

/** Adapt TreeList's stable row hooks rather than replacing its keyboard/expansion model.
 * Only a drag started in this instance is accepted; DataTransfer never authorizes a move.
 * Native dragging supplies its own activation threshold, preview and Escape cancellation.
 * Mouse capture survives native pointer cancellation; dragenter also updates the destination
 * because WebKit may stop sending dragover when the cursor rests just inside an edge.
 * VI: Tích hợp qua hook hàng ổn định của TreeList, giữ mô hình bàn phím/mở nhánh sẵn có.
 * VI: Chỉ nhận kéo bắt đầu trong cây này; DataTransfer không bao giờ cấp quyền di chuyển.
 * VI: Kéo native cung cấp ngưỡng bắt đầu, ảnh xem trước và hủy bằng Escape.
 * VI: Bắt sự kiện chuột vẫn hoạt động sau khi pointer bị hủy; dragenter cũng cập nhật đích
 * VI: vì WebKit có thể ngừng gửi dragover khi con trỏ vừa vào mép rồi dừng.
 */
export function DocsDragTree({
   tree,
   disabled,
   onMove,
   children,
}: {
   tree: ProjectTree;
   disabled: boolean;
   onMove: (target: TreeTarget, destination: string) => Promise<void>;
   children: ReactNode;
}) {
   const tx = useMessages(messages);
   const container = useRef<HTMLElement>(null);
   const active = useRef<TreeTarget | undefined>(undefined);
   const candidate = useRef<string | undefined>(undefined);
   const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
   const expanding = useRef<string | undefined>(undefined);
   const frame = useRef<number | undefined>(undefined);
   const scroll = useRef<{ element: HTMLElement; speed: number } | undefined>(undefined);
   const [dragging, setDragging] = useState<string>();
   const [hover, setHover] = useState<{ id: string; valid: boolean; conflict: boolean }>();
   const [saving, setSaving] = useState(false);
   const blocked = disabled || saving || tree.canManage === false;

   const stopHover = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = undefined;
      expanding.current = undefined;
   };
   const stopScroll = () => {
      if (frame.current != null) cancelAnimationFrame(frame.current);
      frame.current = undefined;
      scroll.current = undefined;
   };
   const reset = () => {
      active.current = undefined;
      candidate.current = undefined;
      setDragging(undefined);
      setHover(undefined);
      stopHover();
      stopScroll();
   };

   useLayoutEffect(() => {
      const host = container.current;
      if (!host) return;
      const install = () => {
         for (const row of host.querySelectorAll<HTMLElement>('[data-tree-id]')) {
            const id = row.dataset.treeId!;
            row.draggable = !blocked && !!treeTarget(tree, id);
            const surface = paint(row);
            if (!surface) continue;
            surface.classList.toggle('opacity-50', dragging === id);
            const targeted = hover?.id === id;
            surface.classList.toggle('ring-2', targeted);
            surface.classList.toggle('ring-inset', targeted);
            surface.classList.toggle('ring-primary', targeted && hover.valid);
            surface.classList.toggle('ring-destructive', targeted && !hover.valid);
            if (targeted) surface.dataset.docsDrop = hover.valid ? 'valid' : 'invalid';
            else delete surface.dataset.docsDrop;
         }
      };
      install();
      const observer = new MutationObserver(install);
      observer.observe(host, { childList: true, subtree: true });
      return () => observer.disconnect();
   }, [tree, blocked, dragging, hover]);

   useEffect(
      () => () => {
         if (timer.current) clearTimeout(timer.current);
         if (frame.current != null) cancelAnimationFrame(frame.current);
      },
      []
   );

   const autoScroll = (event: DragEvent<HTMLElement>) => {
      const element = container.current?.closest<HTMLElement>('[data-docs-scroll]');
      if (!element) return;
      const rect = element.getBoundingClientRect();
      const distance = Math.min(event.clientY - rect.top, rect.bottom - event.clientY);
      const speed =
         distance < SCROLL_EDGE
            ? (1 - Math.max(0, distance) / SCROLL_EDGE) *
              SCROLL_SPEED *
              (event.clientY < (rect.top + rect.bottom) / 2 ? -1 : 1)
            : 0;
      if (!speed) {
         stopScroll();
         return;
      }
      scroll.current = { element, speed };
      if (frame.current != null) return;
      const tick = () => {
         if (!scroll.current) return;
         scroll.current.element.scrollTop += scroll.current.speed;
         frame.current = requestAnimationFrame(tick);
      };
      frame.current = requestAnimationFrame(tick);
   };

   const over = (event: DragEvent<HTMLElement>) => {
      const source = active.current;
      if (!source || blocked) return;
      autoScroll(event);
      const row = rowAt(event.target);
      const id = row?.dataset.treeId;
      const folder = tree.folders.find((item) => item.id === id);
      const valid = !!folder && !documentDropReason(tree.folders, moveSource(source), folder.id);
      const conflict = valid && !!documentMoveConflict(tree.folders, moveSource(source), folder.id);
      setHover((previous) =>
         previous &&
         previous.id === id &&
         previous.valid === valid &&
         previous.conflict === conflict
            ? previous
            : id
              ? { id, valid, conflict }
              : undefined
      );
      event.dataTransfer.dropEffect = valid ? 'move' : 'none';
      if (valid) event.preventDefault();
      if (expanding.current !== id) {
         stopHover();
         expanding.current = id;
         if (valid && row?.getAttribute('aria-expanded') === 'false') {
            timer.current = setTimeout(
               () => row.querySelector<HTMLButtonElement>('[data-tree-toggle]')?.click(),
               HOVER_DELAY
            );
         }
      }
   };

   const destination = tree.folders.find((folder) => folder.id === hover?.id);
   return (
      <section
         ref={container}
         aria-label={tx('Drag to move documents')}
         aria-busy={saving}
         onMouseDownCapture={(event) => {
            const element = event.target as Element;
            candidate.current =
               event.button === 0 &&
               !element.closest('[aria-haspopup], [data-tree-toggle], input, select, textarea, a')
                  ? rowAt(element)?.dataset.treeId
                  : undefined;
         }}
         onDragStart={(event) => {
            const row = rowAt(event.target);
            const target = row?.dataset.treeId ? treeTarget(tree, row.dataset.treeId) : undefined;
            if (blocked || !target || candidate.current !== target.value.id) {
               event.preventDefault();
               return;
            }
            active.current = target;
            setDragging(target.value.id);
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData(DRAG_TYPE, target.value.id);
         }}
         onDragEnter={over}
         onDragOver={over}
         onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
               setHover(undefined);
               stopHover();
               stopScroll();
            }
         }}
         onDrop={(event) => {
            const source = active.current;
            const id = rowAt(event.target)?.dataset.treeId;
            if (!source) return;
            event.preventDefault();
            event.stopPropagation();
            const allowed =
               !blocked && id && !documentDropReason(tree.folders, moveSource(source), id);
            reset();
            if (allowed) {
               setSaving(true);
               void onMove(source, id).finally(() => setSaving(false));
            }
         }}
         onDragEnd={reset}
      >
         {tree.canManage !== false && (
            <Text role="status" aria-live="polite" type="supporting" className="truncate">
               {saving
                  ? tx('Moving…')
                  : hover
                    ? hover.valid
                       ? hover.conflict
                          ? tx('Drop to resolve the folder conflict.')
                          : tx('Move to {value0}', {
                               value0: destination ? folderLabel(destination) : '',
                            })
                       : tx('Cannot move here.')
                    : dragging
                      ? tx('Drag {value0} onto a folder. Esc cancels.', {
                           value0: active.current ? targetName(active.current) : '',
                        })
                      : tx('Drag items onto folders to move them.')}
            </Text>
         )}
         {children}
      </section>
   );
}
