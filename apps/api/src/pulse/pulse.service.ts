import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@circle/database';
import { PrismaService } from '../database/prisma.service';

type PulseItem = {
   id: string;
   kind: 'activity' | 'project-update';
   title: string;
   body: string | null;
   health: string | null;
   createdAt: Date;
   actor: { id: string; name: string; avatarUrl: string | null } | null;
   entity: { type: 'issue' | 'project'; id: string; label: string } | null;
};

const activityLabels: Record<string, string> = {
   'issue.created': 'created an issue',
   'issue.updated': 'updated an issue',
   'issue.archived': 'archived an issue',
   'issue.moved': 'moved an issue',
   'issue.subissue_created': 'created a sub-issue',
   'issue.related': 'linked two issues',
   'issue.unrelated': 'removed an issue relation',
   'project.created': 'created a project',
   'project.updated': 'updated a project',
   'project.archived': 'archived a project',
};

function activityData(value: unknown): Record<string, unknown> {
   return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
}

@Injectable()
export class PulseService {
   constructor(private readonly prisma: PrismaService) {}

   async list(workspaceId: string, userId: string, requestedLimit: number): Promise<PulseItem[]> {
      const membership = await this.prisma.workspaceMember.findFirst({
         where: { workspaceId, userId, status: 'ACTIVE' },
         select: { id: true },
      });
      if (!membership) throw new ForbiddenException('You do not have access to this workspace.');
      const limit = Math.min(Math.max(Math.trunc(requestedLimit), 1), 200);
      const accessibleProject: Prisma.ProjectWhereInput = {
         archivedAt: null,
         OR: [{ teamId: null }, { team: { members: { some: { userId } } } }],
      };
      const [activities, projectUpdates] = await Promise.all([
         this.prisma.activity.findMany({
            where: {
               workspaceId,
               OR: [
                  {
                     issue: {
                        is: {
                           archivedAt: null,
                           team: { members: { some: { userId } } },
                        },
                     },
                  },
                  { project: { is: accessibleProject } },
                  { issueId: null, projectId: null },
               ],
            },
            include: {
               actor: { select: { id: true, name: true, avatarUrl: true } },
               issue: { select: { id: true, identifier: true, title: true } },
               project: { select: { id: true, name: true, identifier: true } },
            },
            orderBy: { createdAt: 'desc' },
            take: limit,
         }),
         this.prisma.projectUpdate.findMany({
            where: { workspaceId, project: accessibleProject },
            include: {
               author: { select: { id: true, name: true, avatarUrl: true } },
               project: { select: { id: true, name: true, identifier: true } },
            },
            orderBy: { createdAt: 'desc' },
            take: limit,
         }),
      ]);

      const activityItems: PulseItem[] = activities.map((activity) => {
         const data = activityData(activity.data);
         const action = activityLabels[activity.type] ?? activity.type.replaceAll('.', ' ');
         const entity = activity.issue
            ? {
                 type: 'issue' as const,
                 id: activity.issue.id,
                 label: `${activity.issue.identifier} · ${activity.issue.title}`,
              }
            : activity.project
              ? {
                   type: 'project' as const,
                   id: activity.project.id,
                   label: activity.project.name,
                }
              : null;
         return {
            id: `activity:${activity.id}`,
            kind: 'activity',
            title: `${activity.actor?.name ?? 'System'} ${action}`,
            body: typeof data.description === 'string' ? data.description : null,
            health: null,
            createdAt: activity.createdAt,
            actor: activity.actor,
            entity,
         };
      });
      const updateItems: PulseItem[] = projectUpdates.map((update) => ({
         id: `project-update:${update.id}`,
         kind: 'project-update',
         title: `${update.author.name} posted an update`,
         body: update.body,
         health: update.health,
         createdAt: update.createdAt,
         actor: update.author,
         entity: { type: 'project', id: update.project.id, label: update.project.name },
      }));
      return [...activityItems, ...updateItems]
         .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
         .slice(0, limit);
   }
}
