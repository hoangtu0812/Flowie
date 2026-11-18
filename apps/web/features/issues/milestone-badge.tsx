import { Badge } from '@/components/ui/badge';
import type { IssueMilestone } from '@/types/issues';
import { Milestone } from 'lucide-react';

/**
 * Milestone chip of an issue: milestone icon and title, muted when the milestone is marked done.
 * VI: Chip milestone của issue: icon milestone và tên, mờ hơn khi milestone đã được đánh dấu xong.
 */
export function MilestoneBadge({ milestone }: { milestone: IssueMilestone }) {
   return (
      <Badge
         variant="outline"
         className={`gap-1 rounded-md text-muted-foreground bg-background max-w-full ${milestone.completedAt ? 'opacity-60' : ''}`}
         title={milestone.title}
      >
         <Milestone className="size-3 shrink-0" aria-hidden />
         <span className="truncate">{milestone.title}</span>
      </Badge>
   );
}
