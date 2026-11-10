'use client';

import { DragDropProvider, DragOverlay } from '@dnd-kit/react';
import { isSortable, useSortable } from '@dnd-kit/react/sortable';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import {
   resolveOrder,
   SidebarBadgeStyle,
   SidebarItemKey,
   SidebarSection,
   useSidebarPrefsStore,
} from '@/store/sidebar-prefs-store';
import {
   Bot,
   Box,
   ChartNoAxesCombined,
   Check,
   ChevronDown,
   ClipboardCheck,
   Compass,
   ContactRound,
   FileText,
   Newspaper,
   FolderKanban,
   GitPullRequestArrow,
   GripVertical,
   Inbox,
   Layers,
   LucideIcon,
   UserRound,
   LifeBuoy,
} from 'lucide-react';

interface ItemConfig {
   key: SidebarItemKey;
   label: string;
   icon: LucideIcon;
   /** Items with a badge get the "Only when badged" option. */
   badged?: boolean;
}

export const PERSONAL_ITEMS: ItemConfig[] = [
   { key: 'inbox', label: 'Inbox', icon: Inbox, badged: true },
   { key: 'reviews', label: 'Reviews', icon: GitPullRequestArrow, badged: true },
   { key: 'approvals', label: 'Approvals', icon: ClipboardCheck, badged: true },
   { key: 'service-desk', label: 'Service Desk', icon: LifeBuoy },
   { key: 'my-issues', label: 'My issues', icon: FolderKanban },
   { key: 'agent', label: 'Agent', icon: Bot },
];

export const WORKSPACE_ITEMS: ItemConfig[] = [
   { key: 'dashboard', label: 'Dashboard', icon: ChartNoAxesCombined },
   { key: 'issues', label: 'All issues', icon: FolderKanban },
   { key: 'initiatives', label: 'Initiatives', icon: Compass },
   { key: 'projects', label: 'Projects', icon: Box },
   { key: 'docs', label: 'Docs', icon: FileText },
   { key: 'news', label: 'News', icon: Newspaper },
   { key: 'views', label: 'Views', icon: Layers },
   { key: 'teams', label: 'Teams', icon: ContactRound },
   { key: 'members', label: 'Members', icon: UserRound },
];

// One row: grip, icon, name, the optional "Only when badged" checkbox and the switch on a single
// line of fixed height, so badged items are exactly as tall as the others. The drag overlay renders
// the same row without a handle ref; it is inert so its copies of the controls are never focused.
// VI: Một dòng: grip, icon, tên, checkbox "Only when badged" (nếu có) và switch trên một hàng cao cố
// VI: định, nên mục có badge cao bằng các mục khác. Bản nổi khi kéo vẽ cùng dòng này nhưng không gắn
// VI: ref handle; nó được đặt inert để các control sao chép không bao giờ nhận focus.
function ItemRow({
   item,
   handleRef,
}: {
   item: ItemConfig;
   handleRef?: (element: Element | null) => void;
}) {
   const { visibility, setVisibility } = useSidebarPrefsStore();
   const current = visibility[item.key] ?? 'always';
   return (
      <>
         <button
            ref={handleRef}
            type="button"
            className="cursor-grab active:cursor-grabbing touch-none text-muted-foreground/50 hover:text-muted-foreground shrink-0"
            aria-label={`Reorder ${item.label}`}
         >
            <GripVertical className="size-3.5" />
         </button>
         <item.icon
            className={cn('size-4 shrink-0', current === 'never' && 'text-muted-foreground/50')}
         />
         <span
            className={cn(
               'flex-1 min-w-0 truncate text-sm',
               current === 'never' && 'text-muted-foreground/60'
            )}
         >
            {item.label}
         </span>
         {/* The switch stores 'always' / 'never'; a badged item keeps its third value 'badged'
             behind this checkbox, so saved prefs need no migration.
             VI: Switch lưu 'always' / 'never'; mục có badge giữ giá trị thứ ba 'badged' qua
             VI: checkbox này, nên cấu hình đã lưu không cần migration. */}
         {item.badged && current !== 'never' && (
            <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
               <Checkbox
                  checked={current === 'badged'}
                  onCheckedChange={(checked) =>
                     setVisibility(item.key, checked === true ? 'badged' : 'always')
                  }
                  className="size-3.5"
                  aria-label={`Show ${item.label} only when badged`}
               />
               Only when badged
            </label>
         )}
         <Switch
            checked={current !== 'never'}
            onCheckedChange={(on) => setVisibility(item.key, on ? 'always' : 'never')}
            aria-label={`Show ${item.label} in sidebar`}
         />
      </>
   );
}

const ROW_CLASS = 'flex h-11 items-center gap-2 px-3';

// The source row stays in the list as the drop placeholder: a dashed slot of the same height that
// the sortable plugin slides to the drop position while the other rows animate out of its way.
// VI: Dòng gốc ở lại trong danh sách làm placeholder: một ô viền nét đứt cùng chiều cao, được plugin
// VI: sortable trượt tới vị trí sẽ thả trong khi các dòng khác chuyển động nhường chỗ.
function SortableItemRow({
   item,
   index,
   section,
}: {
   item: ItemConfig;
   index: number;
   section: SidebarSection;
}) {
   const { ref, handleRef, isDragSource } = useSortable({ id: item.key, index, group: section });
   return (
      <div
         ref={ref}
         data-sidebar-pref-row={item.key}
         className={cn(
            ROW_CLASS,
            isDragSource &&
               'bg-accent/40 outline-dashed outline-1 -outline-offset-4 outline-muted-foreground/40 [&>*]:invisible'
         )}
      >
         <ItemRow item={item} handleRef={handleRef} />
      </div>
   );
}

// One section (Personal / Workspace), reordered with the grip by pointer or keyboard (Space, arrows,
// Space; Escape cancels). Each section has its own provider so items never cross sections. Sorting
// and drop animations come from dnd-kit, which drops them to 0ms under prefers-reduced-motion.
// VI: Một nhóm (Personal / Workspace), đổi thứ tự bằng grip qua chuột hoặc bàn phím (Space, mũi tên,
// VI: Space; Esc huỷ). Mỗi nhóm có provider riêng nên mục không thể sang nhóm khác. Animation sắp
// VI: xếp và khi thả do dnd-kit xử lý, tự về 0ms khi bật prefers-reduced-motion.
function ItemSection({ section, items }: { section: SidebarSection; items: ItemConfig[] }) {
   const { order, moveItem } = useSidebarPrefsStore();

   const orderedKeys = resolveOrder(
      order[section],
      items.map((item) => item.key)
   );
   const ordered = orderedKeys
      .map((key) => items.find((item) => item.key === key))
      .filter((item): item is ItemConfig => Boolean(item));

   return (
      <DragDropProvider
         onDragEnd={(event) => {
            const source = event.operation.source;
            if (event.canceled || !isSortable(source) || source.initialIndex === source.index)
               return;
            moveItem(section, source.initialIndex, source.index);
         }}
      >
         <div className="rounded-lg border divide-y divide-border/60">
            {ordered.map((item, index) => (
               <SortableItemRow key={item.key} item={item} index={index} section={section} />
            ))}
         </div>
         <DragOverlay>
            {(source) => {
               const item = ordered.find((candidate) => candidate.key === source.id);
               return item ? (
                  <div inert className={cn(ROW_CLASS, 'rounded-md border bg-popover shadow-lg')}>
                     <ItemRow item={item} />
                  </div>
               ) : null;
            }}
         </DragOverlay>
      </DragDropProvider>
   );
}

/** Linear-style "Customize sidebar" modal (badge style, visibility, drag & drop order). */
export function CustomizeSidebarDialog({
   open,
   onOpenChange,
}: {
   open: boolean;
   onOpenChange: (open: boolean) => void;
}) {
   const { badgeStyle, setBadgeStyle } = useSidebarPrefsStore();

   return (
      <Dialog open={open} onOpenChange={onOpenChange}>
         <DialogContent className="sm:max-w-md p-0 gap-0">
            <DialogHeader className="px-5 pt-5 pb-3">
               <DialogTitle className="text-base">Customize sidebar</DialogTitle>
            </DialogHeader>
            <div className="px-5 pb-5 flex flex-col gap-5 overflow-y-auto max-h-[70vh]">
               <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
                  <span className="text-sm">Default badge style</span>
                  <DropdownMenu>
                     <DropdownMenuTrigger className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors outline-none">
                        {badgeStyle === 'count' ? (
                           <span className="text-xs bg-accent rounded px-1">1</span>
                        ) : (
                           <span className="size-1.5 rounded-full bg-muted-foreground inline-block" />
                        )}
                        {badgeStyle === 'count' ? 'Count' : 'Dot'}
                        <ChevronDown className="size-3.5" />
                     </DropdownMenuTrigger>
                     <DropdownMenuContent align="end" className="min-w-32">
                        {(['count', 'dot'] as SidebarBadgeStyle[]).map((style) => (
                           <DropdownMenuItem key={style} onClick={() => setBadgeStyle(style)}>
                              {style === 'count' ? 'Count' : 'Dot'}
                              {badgeStyle === style && <Check className="ml-auto size-3.5" />}
                           </DropdownMenuItem>
                        ))}
                     </DropdownMenuContent>
                  </DropdownMenu>
               </div>

               <div className="flex flex-col gap-2">
                  <span className="text-sm font-medium">Personal</span>
                  <ItemSection section="personal" items={PERSONAL_ITEMS} />
               </div>

               <div className="flex flex-col gap-2">
                  <span className="text-sm font-medium">Workspace</span>
                  <ItemSection section="workspace" items={WORKSPACE_ITEMS} />
               </div>
            </div>
         </DialogContent>
      </Dialog>
   );
}
