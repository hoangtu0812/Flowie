'use client';
import { Search } from 'lucide-react';
import { useMessages } from '@/features/shared/use-messages';
import { useModifierKey } from '@/features/shared/use-modifier-key';
import { messages } from '@/features/navigation/messages.vi';
import { openCommandPalette } from '@/components/layout/command-palette';

/**
 * Always-visible entry to the command palette for people who do not know ⌘K / Ctrl+K. It only
 * opens the existing palette, so search, navigation and permissions stay in one place.
 * VI: Lối vào command palette luôn hiển thị cho người không biết ⌘K / Ctrl+K. Nút chỉ mở
 * VI: palette sẵn có, nên tìm kiếm, điều hướng và phân quyền vẫn nằm ở một chỗ.
 */
export function SearchButton() {
   const tx = useMessages(messages);
   const modifier = useModifierKey();
   return (
      <button
         type="button"
         onClick={openCommandPalette}
         className="flex h-8 w-full items-center gap-2 rounded-md border border-sidebar-border bg-background/60 px-2 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:hidden"
      >
         <Search className="size-4 shrink-0" />
         <span className="truncate">{tx('Search')}…</span>
         <kbd className="ml-auto rounded border border-border/60 bg-muted/60 px-1.5 text-[10px] font-medium">
            {modifier === '⌘' ? '⌘K' : 'Ctrl K'}
         </kbd>
      </button>
   );
}
