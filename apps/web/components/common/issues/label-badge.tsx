import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { LabelInterface } from '@/mock-data/labels';

export function LabelBadge({ label, className }: { label: LabelInterface[]; className?: string }) {
   return (
      <>
         {label.map((l) => (
            <Badge
               key={l.id}
               variant="outline"
               className={cn(
                  'gap-1.5 rounded-full text-muted-foreground bg-background max-w-full',
                  className
               )}
            >
               <span
                  className="size-1.5 rounded-full"
                  style={{ backgroundColor: l.color }}
                  aria-hidden="true"
               ></span>
               {l.name}
            </Badge>
         ))}
      </>
   );
}
