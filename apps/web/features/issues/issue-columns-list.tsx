'use client';

import { DragDropProvider, DragOverlay } from '@dnd-kit/react';
import { isSortable, useSortable } from '@dnd-kit/react/sortable';
import { GripVertical } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import type { DisplayPropertyKey } from '@/store/display-settings-store';
import {
   ISSUE_COLUMN_LABEL,
   moveIssueColumn,
   setIssueColumnVisible,
   TITLE_PROPERTIES,
   useIssueColumns,
   type IssueColumnKey,
} from './issue-columns';

const ROW_CLASS = 'flex h-8 items-center gap-2 px-2';

// One row: grip (absent for properties inside the title cell), name and the
// switch on the right. The drag overlay renders the same row without a handle
// ref and inert, so its copies of the controls are never focused.
// VI: Một dòng: grip (không có với thuộc tính nằm trong ô Title), tên và switch
// bên phải. Bản nổi khi kéo vẽ cùng dòng này nhưng không gắn ref handle và đặt
// inert, nên các control sao chép không bao giờ nhận focus.
function PropertyRow({
   property,
   label,
   handleRef,
   movable = false,
}: {
   property: DisplayPropertyKey;
   label: string;
   handleRef?: (element: Element | null) => void;
   movable?: boolean;
}) {
   const { visible } = useIssueColumns();
   return (
      <>
         {movable ? (
            <button
               ref={handleRef}
               type="button"
               className="cursor-grab active:cursor-grabbing touch-none text-muted-foreground/50 hover:text-muted-foreground shrink-0"
               aria-label={`Reorder ${label}`}
            >
               <GripVertical className="size-3.5" />
            </button>
         ) : (
            <span className="size-3.5 shrink-0" />
         )}
         <span
            className={cn(
               'flex-1 min-w-0 truncate text-xs',
               !visible[property] && 'text-muted-foreground'
            )}
         >
            {label}
         </span>
         <Switch
            checked={visible[property]}
            onCheckedChange={(on) => setIssueColumnVisible(property, on)}
            aria-label={`Show ${label}`}
         />
      </>
   );
}

// The source row stays in the list as the drop placeholder: a dashed slot of
// the same height that the sortable plugin slides to the drop position while
// the other rows animate out of its way.
// VI: Dòng gốc ở lại trong danh sách làm placeholder: một ô viền nét đứt cùng
// chiều cao, được plugin sortable trượt tới vị trí sẽ thả trong khi các dòng
// khác chuyển động nhường chỗ.
function SortableColumnRow({ column, index }: { column: IssueColumnKey; index: number }) {
   const { ref, handleRef, isDragSource } = useSortable({ id: column, index });
   return (
      <div
         ref={ref}
         data-issue-column-row={column}
         className={cn(
            ROW_CLASS,
            isDragSource &&
               'bg-accent/40 outline-dashed outline-1 -outline-offset-2 outline-muted-foreground/40 [&>*]:invisible'
         )}
      >
         <PropertyRow
            property={column}
            label={ISSUE_COLUMN_LABEL[column]}
            handleRef={handleRef}
            movable
         />
      </div>
   );
}

/**
 * List options → display properties as rows. Properties inside the title cell
 * only toggle; the columns after it are reordered with the grip by pointer or
 * keyboard (Space, arrows, Space; Escape cancels). The order is the same one the
 * table header edits, so both always agree.
 * VI: List options → thuộc tính hiển thị dạng dòng. Thuộc tính trong ô Title chỉ
 * bật/tắt; các cột sau đó đổi thứ tự bằng grip qua chuột hoặc bàn phím (Space,
 * mũi tên, Space; Esc huỷ). Thứ tự này chính là thứ tự header bảng chỉnh, nên
 * hai nơi luôn khớp nhau.
 */
export function IssueColumnsList() {
   const { order } = useIssueColumns();
   return (
      <div className="flex flex-col gap-1.5">
         <div className="rounded-md border divide-y divide-border/60">
            {TITLE_PROPERTIES.map((property) => (
               <div key={property.key} className={ROW_CLASS}>
                  <PropertyRow property={property.key} label={property.label} />
               </div>
            ))}
         </div>
         <DragDropProvider
            onDragEnd={(event) => {
               const source = event.operation.source;
               if (event.canceled || !isSortable(source) || source.initialIndex === source.index)
                  return;
               moveIssueColumn(source.initialIndex, source.index);
            }}
         >
            <div className="rounded-md border divide-y divide-border/60">
               {order.map((column, index) => (
                  <SortableColumnRow key={column} column={column} index={index} />
               ))}
            </div>
            <DragOverlay>
               {(source) => {
                  const column = order.find((candidate) => candidate === source.id);
                  return column ? (
                     <div inert className={cn(ROW_CLASS, 'rounded-md border bg-popover shadow-lg')}>
                        <PropertyRow property={column} label={ISSUE_COLUMN_LABEL[column]} movable />
                     </div>
                  ) : null;
               }}
            </DragOverlay>
         </DragDropProvider>
      </div>
   );
}
