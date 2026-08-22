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

   async list(
      workspaceId: string,
      userId: string,
      issueId?: string,
      projectId?: string
   ): Promise<ActivityResponse[]> {
      if (!issueId && !projectId) throw new NotFoundException('An issue or project is required.');
      const membership = await this.prisma.workspaceMember.findFirst({
         where: { workspaceId, userId, status: 'ACTIVE' },
      });
      if (!membership) throw new ForbiddenException('You do not have access to this workspace.');
      if (issueId) await this.authorizeIssue(workspaceId, issueId, userId);
      if (projectId) await this.authorizeProject(workspaceId, projectId, userId);
      const activities = await this.prisma.activity.findMany({
         where: { workspaceId, ...(issueId ? { issueId } : { projectId }) },
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

   private async authorizeIssue(workspaceId: string, issueId: string, userId: string) {
      const issue = await this.prisma.issue.findFirst({
         where: { id: issueId, workspaceId, archivedAt: null },
      });
      if (!issue) throw new NotFoundException('Issue not found.');
      const team = await this.prisma.team.findFirst({
         where: { id: issue.teamId, workspaceId, members: { some: { userId } } },
      });
      if (!team) throw new ForbiddenException('You do not have access to this issue.');
   }

   private async authorizeProject(workspaceId: string, projectId: string, userId: string) {
      const project = await this.prisma.project.findFirst({
         where: { id: projectId, workspaceId, archivedAt: null },
      });
      if (!project) throw new NotFoundException('Project not found.');
      if (!project.teamId) return;
      const team = await this.prisma.team.findFirst({
         where: { id: project.teamId, workspaceId, members: { some: { userId } } },
      });
      if (!team) throw new ForbiddenException('You do not have access to this project.');
   }
}
