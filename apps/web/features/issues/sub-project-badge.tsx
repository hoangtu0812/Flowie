import { Badge } from '@/components/ui/badge';
import type { SubProjectLabel } from '@/types/labels';
import { FolderTree } from 'lucide-react';

/**
 * Sub project chips. A dashed border and a folder-tree icon set them apart from workspace label
 * chips (solid border, colour dot); the colour shows on the icon. Archived ones stay readable but
 * muted.
 * VI: Chip sub project. Viền nét đứt và icon cây thư mục phân biệt với chip label workspace (viền
 * VI: liền, chấm màu); màu hiển thị trên icon. Bản đã lưu trữ vẫn đọc được nhưng mờ hơn.
 */
export function SubProjectBadge({ labels }: { labels: SubProjectLabel[] }) {
   return (
      <>
         {labels.map((label) => (
            <Badge
               key={label.id}
               variant="outline"
               className={`gap-1 rounded-md border-dashed text-muted-foreground bg-background max-w-full ${label.archivedAt ? 'opacity-60' : ''}`}
               title={label.archivedAt ? `${label.name} (archived)` : label.name}
            >
               <FolderTree className="size-3 shrink-0" style={{ color: label.color }} aria-hidden />
               <span className="truncate">{label.name}</span>
            </Badge>
         ))}
      </>
   );
}
