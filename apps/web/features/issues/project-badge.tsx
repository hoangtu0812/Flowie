'use client';

import { useRef } from 'react';
import { HStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { Icon } from '@astryxdesign/core/Icon';
import { Tooltip } from '@astryxdesign/core/Tooltip';
import { DesignSurface } from '@/components/common/design-surface';
import { Project } from '@/types/projects';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { projectPath } from '@/lib/project-route';

export function ProjectBadge({ project }: { project: Project }) {
   const { orgId } = useParams<{ orgId: string }>();
   const anchor = useRef<HTMLAnchorElement>(null);
   return (
      <HStack width="100%" className="min-w-0 max-w-full [&>div]:min-w-0 [&>div]:max-w-full">
         <DesignSurface>
            <Link
               ref={anchor}
               href={projectPath(orgId, project, 'overview')}
               className="flex min-w-0 max-w-full"
               aria-label={project.name}
            >
               <HStack
                  gap={1}
                  paddingInline={2}
                  className="min-w-0 max-w-full rounded-full border bg-background text-muted-foreground"
               >
                  <HStack className="shrink-0">
                     <Icon
                        icon={({ className }) => <project.icon className={className} />}
                        size="sm"
                     />
                  </HStack>
                  <Text type="supporting" maxLines={1} hasTruncateTooltip={false}>
                     {project.name}
                  </Text>
               </HStack>
            </Link>
            <Tooltip
               anchorRef={anchor}
               content={project.name}
               placement="above"
               focusTrigger="always"
            />
         </DesignSurface>
      </HStack>
   );
}
