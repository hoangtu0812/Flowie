import { cn } from '@/lib/utils';
import { FolderKanban, type LucideIcon } from 'lucide-react';

const emojiIcons = new Map<string, LucideIcon>();

/**
 * Returns the icon component for a project: its emoji when set, otherwise the default folder.
 * Components are cached per emoji so React keeps the same component type between renders
 * instead of remounting it. They accept the same `className` sizing as Lucide icons.
 * VI: Trả về component icon của dự án: emoji nếu có, ngược lại là biểu tượng thư mục mặc định.
 * Component được cache theo emoji để React giữ cùng một kiểu component giữa các lần render
 * thay vì mount lại. Chúng nhận `className` kích thước giống icon Lucide.
 */
export function projectIcon(icon: string | null | undefined): LucideIcon {
   if (!icon) return FolderKanban;
   let component = emojiIcons.get(icon);
   if (!component) {
      const EmojiIcon = ({ className }: { className?: string }) => (
         <span
            aria-hidden
            className={cn('inline-flex items-center justify-center leading-none', className)}
         >
            {icon}
         </span>
      );
      component = EmojiIcon as unknown as LucideIcon;
      emojiIcons.set(icon, component);
   }
   return component;
}
