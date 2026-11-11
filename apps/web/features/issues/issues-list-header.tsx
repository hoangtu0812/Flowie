'use client';

import { DragDropProvider, DragOverlay } from '@dnd-kit/react';
import { isSortable, useSortable } from '@dnd-kit/react/sortable';
import { pointerDistance } from '@dnd-kit/collision';
import {
   PointerActivationConstraints,
   PointerSensor,
   type Draggable,
   type Droppable,
} from '@dnd-kit/dom';
import { HStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { ArrowUp, ArrowDown, ArrowUpDown, EyeOff } from 'lucide-react';
import { useRef, type KeyboardEvent, type PointerEvent } from 'react';
import {
   ContextMenu,
   ContextMenuContent,
   ContextMenuItem,
   ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { cn } from '@/lib/utils';
import { useMessages } from '@/features/shared/use-messages';
import { messages } from '@/features/issues/messages.vi';
import { useDisplaySettingsStore } from '@/store/display-settings-store';
import type { ColumnSortKey } from '@/features/issues/column-sorting';
import {
   ISSUE_COLUMN,
   ISSUE_COLUMN_LABEL,
   issueColumnWidthLimit,
   moveIssueColumn,
   resizeIssueColumn,
   setIssueColumnVisible,
   useIssueColumns,
   type IssueColumnKey,
   type IssueColumnWidthKey,
} from './issue-columns';

function SortLabel({ column, label }: { column: ColumnSortKey; label: string }) {
   const sorts = useDisplaySettingsStore((state) => state.columnSorts) ?? [];
   const toggle = useDisplaySettingsStore((state) => state.toggleColumnSort);
   const index = sorts.findIndex((sort) => sort.key === column);
   const sort = sorts[index];
   const tx = useMessages(messages);
   const hint = tx('Click to sort; Shift+click for multiple columns.');
   return (
      <button
         type="button"
         className="inline-flex items-center gap-1 min-w-0 hover:text-foreground"
         aria-label={`${label}: ${tx(sort?.direction === 'asc' ? 'ascending' : sort ? 'descending' : 'default order')}${index >= 0 ? ` (${index + 1})` : ''}`}
         title={hint}
         onClick={(event) => toggle(column, event.shiftKey)}
      >
         <Text type="inherit" className="truncate">
            {label}
         </Text>
         {sort ? (
            sort.direction === 'asc' ? (
               <ArrowUp className="size-3 shrink-0" />
            ) : (
               <ArrowDown className="size-3 shrink-0" />
            )
         ) : (
            <ArrowUpDown className="size-3 shrink-0" />
         )}
         {sorts.length > 1 && index >= 0 && <Text type="inherit">{index + 1}</Text>}
      </button>
   );
}

// Drag handle on the right edge of a header cell, kept inside the cell because
// most cells clip their overflow. Pointer capture keeps the
// drag alive outside the cell; each move writes the clamped width to the
// account's columns so every row follows live, and PreferenceSync debounces the
// save. Arrow keys resize by 16px for keyboard users.
// VI: Tay kéo ở mép phải ô header, nằm trong ô vì phần lớn các ô cắt phần tràn.
// VI: Pointer capture giữ thao tác kéo khi con trỏ
// ra ngoài ô; mỗi lần di chuyển ghi độ rộng đã kẹp vào cấu hình cột của tài
// khoản nên mọi dòng đổi theo ngay, và PreferenceSync gom việc lưu. Phím mũi tên
// đổi 16px cho người dùng bàn phím.
function ResizeHandle({
   column,
   label,
   width,
}: {
   column: IssueColumnWidthKey;
   label: string;
   width: number;
}) {
   const start = useRef<{ x: number; width: number } | null>(null);
   const { min, max } = issueColumnWidthLimit(column);
   return (
      <div
         data-column-resize={column}
         role="separator"
         aria-orientation="vertical"
         aria-label={`Resize ${label}`}
         aria-valuenow={width}
         aria-valuemin={min}
         aria-valuemax={max}
         tabIndex={0}
         className="absolute right-0 top-0 z-10 h-full w-2 cursor-col-resize touch-none outline-none after:absolute after:inset-y-2 after:right-0 after:w-px group-hover/header:after:bg-border hover:after:bg-primary focus-visible:after:bg-primary"
         onPointerDown={(event: PointerEvent<HTMLDivElement>) => {
            if (event.button !== 0) return;
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            start.current = {
               x: event.clientX,
               width: event.currentTarget.parentElement?.getBoundingClientRect().width ?? width,
            };
         }}
         onPointerMove={(event) => {
            if (start.current)
               resizeIssueColumn(column, start.current.width + event.clientX - start.current.x);
         }}
         onPointerUp={() => (start.current = null)}
         onPointerCancel={() => (start.current = null)}
         onClick={(event) => event.stopPropagation()}
         onKeyDown={(event: KeyboardEvent) => {
            const step = event.key === 'ArrowRight' ? 16 : event.key === 'ArrowLeft' ? -16 : 0;
            if (!step) return;
            event.preventDefault();
            resizeIssueColumn(column, width + step);
         }}
      />
   );
}

// Swaps with a neighbour only once the pointer has passed that neighbour's
// centre, moving away from the placeholder. The default detector swaps as soon
// as the pointer is over a neighbour; with columns of different widths a wider
// neighbour then slides back under the pointer and the two swap back and forth,
// so a narrow column could never be dropped in front of a wide first column.
// Rectangles are read from the DOM in viewport coordinates, like the pointer.
// VI: Chỉ đổi chỗ với cột bên cạnh khi con trỏ đã vượt qua tâm của cột đó, theo
// hướng rời khỏi placeholder. Bộ dò mặc định đổi chỗ ngay khi con trỏ nằm trên cột
// bên cạnh; vì các cột rộng khác nhau, cột rộng hơn lại trượt về dưới con trỏ và
// hai cột đổi qua đổi lại, nên cột hẹp không bao giờ thả được trước cột đầu rộng.
// Toạ độ hình chữ nhật đọc từ DOM theo viewport, cùng hệ toạ độ với con trỏ.
//
// After each swap the sortable plugin points the drop target back at the dragged
// column, and dnd-kit updates the target only when the list of collisions
// changes. A column that was already colliding before that swap would therefore
// never become the target again and the drag would stop one slot short, which
// happens on fast drags. Reporting no collision while the target is the dragged
// column clears the list, so the next pointer move re-reports the passed column.
// VI: Sau mỗi lần đổi chỗ, plugin sortable đặt drop target về chính cột đang kéo,
// và dnd-kit chỉ cập nhật target khi danh sách va chạm thay đổi. Cột đã va chạm
// từ trước lần đổi chỗ đó vì vậy sẽ không bao giờ thành target nữa và thao tác
// kéo dừng thiếu một vị trí, điều xảy ra khi kéo nhanh. Trả về không va chạm khi
// target là cột đang kéo sẽ xoá danh sách, nên lần di chuyển con trỏ kế tiếp báo
// lại cột đã bị vượt qua.
const passedCenter: typeof pointerDistance = (input) => {
   const { dragOperation, droppable } = input;
   const source = (dragOperation.source as Draggable | null)?.element;
   const target = (droppable as unknown as Droppable).element;
   if (!source || !target || droppable.id === dragOperation.source?.id) return null;
   const pointer = dragOperation.position.current.x;
   const placeholder = source.getBoundingClientRect();
   const rect = target.getBoundingClientRect();
   const center = rect.left + rect.width / 2;
   const passed =
      rect.right <= placeholder.left + 1
         ? pointer < center
         : rect.left >= placeholder.right - 1 && pointer > center;
   if (!passed || dragOperation.target?.id === dragOperation.source?.id) return null;
   return pointerDistance(input);
};

// A movable header cell. While dragged, the source cell stays in the row as the
// drop placeholder (dashed, same width) that the sortable plugin slides to the
// drop position as the other headers animate aside; the overlay follows the
// pointer. Right-click opens the column menu.
// VI: Một ô header di chuyển được. Khi kéo, ô gốc ở lại trong hàng làm
// placeholder (nét đứt, cùng độ rộng) được plugin sortable trượt tới vị trí sẽ
// thả trong khi các header khác chuyển động nhường chỗ; bản nổi đi theo con trỏ.
// Chuột phải mở menu của cột.
function SortableHeader({
   column,
   index,
   width,
}: {
   column: IssueColumnKey;
   index: number;
   width: number;
}) {
   const tx = useMessages(messages);
   const label = tx(ISSUE_COLUMN_LABEL[column]);
   const { ref, isDragSource } = useSortable({
      id: column,
      index,
      collisionDetector: passedCenter,
   });
   return (
      <ContextMenu>
         <ContextMenuTrigger asChild>
            {/* An explicit role and tabindex stop dnd-kit from turning the cell into a
                focusable button around the sort button; keyboard reordering lives in
                Display → List options.
                VI: Role và tabindex tường minh ngăn dnd-kit biến ô thành một button nhận
                focus bao quanh nút sort; đổi thứ tự bằng bàn phím nằm ở Display → List
                options. */}
            <div
               ref={ref}
               role="group"
               tabIndex={-1}
               data-issue-column={column}
               className={cn(
                  ISSUE_COLUMN[column],
                  'relative h-full cursor-grab active:cursor-grabbing',
                  isDragSource &&
                     'bg-accent/40 outline-dashed outline-1 -outline-offset-4 outline-muted-foreground/40 [&>*]:invisible'
               )}
               style={{ width }}
            >
               <SortLabel column={column} label={label} />
               <ResizeHandle column={column} label={label} width={width} />
            </div>
         </ContextMenuTrigger>
         <ContextMenuContent>
            <ContextMenuItem onSelect={() => setIssueColumnVisible(column, false)}>
               <EyeOff />
               {tx('Hide column')}
            </ContextMenuItem>
         </ContextMenuContent>
      </ContextMenu>
   );
}

// Pointer drags start after 5px so a plain click still sorts, and never from
// the resize handle. The sensor listens on the cell itself, before React sees
// the event, so stopping propagation in the handle could not prevent it.
// VI: Kéo bằng con trỏ bắt đầu sau 5px để bấm thường vẫn sort, và không bao
// giờ bắt đầu từ tay resize. Sensor lắng nghe trên chính ô, trước khi React
// nhận sự kiện, nên chặn propagation trong tay resize không ngăn được.
const HEADER_SENSORS = [
   PointerSensor.configure({
      activationConstraints: [new PointerActivationConstraints.Distance({ value: 5 })],
      preventActivation: (event) =>
         event.target instanceof Element && Boolean(event.target.closest('[data-column-resize]')),
   }),
];

export function IssuesListHeader() {
   const tx = useMessages(messages);
   const { visible, order, widths } = useIssueColumns();
   const shown = order.filter((column) => visible[column]);
   return (
      <HStack
         gap={0}
         paddingInline={6}
         height={32}
         className="group/header bg-container text-xs text-muted-foreground border-b sticky top-0 z-20"
      >
         <HStack className="relative h-full min-w-0" style={{ flex: `1 0 ${widths.title}px` }}>
            <SortLabel column="title" label={tx('Title')} />
            <ResizeHandle column="title" label={tx('Title')} width={widths.title} />
         </HStack>
         <DragDropProvider
            sensors={HEADER_SENSORS}
            onDragEnd={(event) => {
               const source = event.operation.source;
               if (event.canceled || !isSortable(source) || source.initialIndex === source.index)
                  return;
               // Indexes count shown columns only; map them back to the full order.
               // VI: Chỉ số chỉ đếm cột đang hiện; ánh xạ lại về thứ tự đầy đủ.
               moveIssueColumn(
                  order.indexOf(shown[source.initialIndex]!),
                  order.indexOf(shown[source.index]!)
               );
            }}
         >
            {shown.map((column, index) => (
               <SortableHeader key={column} column={column} index={index} width={widths[column]} />
            ))}
            <DragOverlay>
               {(source) => {
                  const column = shown.find((candidate) => candidate === source.id);
                  return column ? (
                     <div
                        inert
                        className="flex h-8 items-center rounded-md border bg-popover px-2 text-xs text-foreground shadow-lg"
                        style={{ width: widths[column] }}
                     >
                        {tx(ISSUE_COLUMN_LABEL[column])}
                     </div>
                  ) : null;
               }}
            </DragOverlay>
         </DragDropProvider>
      </HStack>
   );
}
