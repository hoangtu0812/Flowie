import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

export type ActivityResponse = {
   id: string;
   type: string;
   createdAt: Date;
   actor: { id: string; name: string; avatarUrl: string | null } | null;
};

@Injectable()
export class ActivitiesService {
   constructor(private readonly prisma: PrismaService) {}

   async list(workspaceId: string, issueId: string, userId: string): Promise<ActivityResponse[]> {
      const issue = await this.prisma.issue.findFirst({
         where: { id: issueId, workspaceId, archivedAt: null },
         select: { teamId: true },
      });
      if (!issue) throw new NotFoundException('Issue not found.');
      const membership = await this.prisma.workspaceMember.findFirst({
         where: { workspaceId, userId, status: 'ACTIVE' },
      });
      const team =
         membership &&
         (await this.prisma.team.findFirst({
            where: { id: issue.teamId, workspaceId, members: { some: { userId } } },
         }));
      if (!team) throw new ForbiddenException('You do not have access to this issue.');
      const activities = await this.prisma.activity.findMany({
         where: { workspaceId, issueId },
         include: { actor: { select: { id: true, name: true, avatarUrl: true } } },
         orderBy: { createdAt: 'asc' },
      });
      return activities.map((activity) => ({
         id: activity.id,
         type: activity.type,
         createdAt: activity.createdAt,
         actor: activity.actor,
      }));
   }
}
