import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { IssueStatusCategory } from '@circle/database';
import { PrismaService } from '../database/prisma.service';
import { CreateIssueDto } from './dto/create-issue.dto';
import { UpdateIssueDto } from './dto/update-issue.dto';
import { NotificationsService } from '../notifications/notifications.service';

const issueInclude = {
   team: { select: { id: true, name: true, identifier: true } },
   status: { select: { id: true, name: true, category: true, color: true } },
   project: { select: { id: true, name: true, identifier: true } },
   creator: { select: { id: true, name: true, avatarUrl: true } },
   assignee: { select: { id: true, name: true, avatarUrl: true } },
} as const;

@Injectable()
export class IssuesService {
   constructor(
      private readonly prisma: PrismaService,
      private readonly notifications: NotificationsService
   ) {}

   async list(
      workspaceId: string,
      userId: string,
      teamId?: string,
      categories?: IssueStatusCategory[],
      scope?: 'assigned' | 'created'
   ) {
      await this.authorize(workspaceId, userId, teamId);
      return this.prisma.issue.findMany({
         where: {
            workspaceId,
            archivedAt: null,
            ...(teamId ? { teamId } : { team: { members: { some: { userId } } } }),
            ...(categories?.length ? { status: { category: { in: categories } } } : {}),
            ...(scope === 'assigned' ? { assigneeId: userId } : {}),
            ...(scope === 'created' ? { creatorId: userId } : {}),
         },
         include: issueInclude,
         orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      });
   }

   async create(dto: CreateIssueDto, userId: string) {
      await this.authorize(dto.workspaceId, userId, dto.teamId);
      const issue = await this.prisma.$transaction(async (tx) => {
         const team = await tx.team.update({
            where: { id: dto.teamId },
            data: { issueSequence: { increment: 1 } },
            select: { identifier: true, issueSequence: true },
         });
         const status = dto.statusId
            ? await tx.issueStatus.findFirst({
                 where: { id: dto.statusId, workspaceId: dto.workspaceId },
              })
            : await tx.issueStatus.findFirst({
                 where: { workspaceId: dto.workspaceId, category: 'UNSTARTED' },
                 orderBy: { position: 'asc' },
              });
         if (!status) throw new NotFoundException('A valid issue status is required.');
         if (dto.projectId) {
            const project = await tx.project.findFirst({
               where: { id: dto.projectId, workspaceId: dto.workspaceId, archivedAt: null },
            });
            if (!project) throw new NotFoundException('Project not found.');
         }
         if (dto.assigneeId) {
            const assignee = await tx.workspaceMember.findFirst({
               where: { workspaceId: dto.workspaceId, userId: dto.assigneeId, status: 'ACTIVE' },
            });
            if (!assignee) throw new NotFoundException('Assignee is not a workspace member.');
         }
         const issue = await tx.issue.create({
            data: {
               ...dto,
               statusId: status.id,
               identifier: `${team.identifier}-${team.issueSequence}`,
               number: team.issueSequence,
               creatorId: userId,
            },
            include: issueInclude,
         });
         await tx.activity.create({
            data: {
               workspaceId: dto.workspaceId,
               issueId: issue.id,
               actorId: userId,
               type: 'issue.created',
               data: { title: issue.title, identifier: issue.identifier },
            },
         });
         return issue;
      });
      void this.notifications.notifyWorkspace(
         dto.workspaceId,
         userId,
         'issue.created',
         'issue',
         issue.id,
         { title: issue.title, identifier: issue.identifier },
         `🆕 Issue ${issue.identifier}: ${issue.title}`
      );
      return issue;
   }

   async get(issueId: string, workspaceId: string, userId: string) {
      const issue = await this.prisma.issue.findFirst({
         where: { id: issueId, workspaceId, archivedAt: null },
         include: {
            ...issueInclude,
            _count: { select: { comments: true } },
         },
      });
      if (!issue) throw new NotFoundException('Issue not found.');
      await this.authorize(workspaceId, userId, issue.teamId);
      return issue;
   }

   async update(issueId: string, workspaceId: string, dto: UpdateIssueDto, userId: string) {
      const issue = await this.get(issueId, workspaceId, userId);
      const status = dto.statusId
         ? await this.prisma.issueStatus.findFirst({ where: { id: dto.statusId, workspaceId } })
         : undefined;
      if (dto.statusId && !status) throw new NotFoundException('Issue status not found.');
      if (dto.projectId) {
         const project = await this.prisma.project.findFirst({
            where: { id: dto.projectId, workspaceId, archivedAt: null },
         });
         if (!project || (project.teamId && project.teamId !== issue.teamId)) {
            throw new NotFoundException('Project not found for this team.');
         }
      }
      if (dto.assigneeId) {
         const assignee = await this.prisma.workspaceMember.findFirst({
            where: { workspaceId, userId: dto.assigneeId, status: 'ACTIVE' },
         });
         if (!assignee) throw new NotFoundException('Assignee is not a workspace member.');
      }
      return this.prisma.$transaction(async (tx) => {
         const updated = await tx.issue.update({
            where: { id: issueId },
            data: {
               ...dto,
               ...(status
                  ? {
                       completedAt: status.category === 'COMPLETED' ? new Date() : null,
                       canceledAt: status.category === 'CANCELED' ? new Date() : null,
                    }
                  : {}),
            },
            include: issueInclude,
         });
         await tx.activity.create({
            data: {
               workspaceId,
               issueId,
               actorId: userId,
               type: 'issue.updated',
               data: { fields: Object.keys(dto) },
            },
         });
         return updated;
      });
   }

   async archive(issueId: string, workspaceId: string, userId: string) {
      await this.get(issueId, workspaceId, userId);
      return this.prisma.$transaction(async (tx) => {
         const archivedAt = new Date();
         const archived = await tx.issue.update({
            where: { id: issueId },
            data: { archivedAt },
            include: issueInclude,
         });
         await tx.activity.create({
            data: { workspaceId, issueId, actorId: userId, type: 'issue.archived', data: {} },
         });
         return archived;
      });
   }

   private async authorize(workspaceId: string, userId: string, teamId?: string) {
      const membership = await this.prisma.workspaceMember.findFirst({
         where: { workspaceId, userId, status: 'ACTIVE' },
      });
      if (!membership) throw new ForbiddenException('You do not have access to this workspace.');
      if (!teamId) return;
      const team = await this.prisma.team.findFirst({
         where: { id: teamId, workspaceId, archivedAt: null, members: { some: { userId } } },
      });
      if (!team) throw new ForbiddenException('You do not have access to this team.');
   }
}
