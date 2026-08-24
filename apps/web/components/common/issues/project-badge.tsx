'use client';

import { Badge } from '@/components/ui/badge';
import { Project } from '@/mock-data/projects';
import Link from 'next/link';
import { useParams } from 'next/navigation';

export function ProjectBadge({ project }: { project: Project }) {
   const { orgId } = useParams<{ orgId: string }>();
   return (
      <Link
         href={`/${orgId}/project/${project.id}/overview`}
         className="flex items-center justify-center gap-.5"
      >
         <Badge
            variant="outline"
            className="gap-1.5 rounded-full text-muted-foreground bg-background"
         >
            <project.icon size={16} />
            {project.name}
         </Badge>
      </Link>
   );
}
