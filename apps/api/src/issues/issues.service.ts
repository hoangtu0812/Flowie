import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { IssueStatusCategory } from '@circle/database';
import { PrismaService } from '../database/prisma.service';
import { CreateIssueDto } from './dto/create-issue.dto';

const issueInclude = {
   team: { select: { id: true, name: true, identifier: true } },
   status: { select: { id: true, name: true, category: true, color: true } },
   project: { select: { id: true, name: true, identifier: true } },
   creator: { select: { id: true, name: true, avatarUrl: true } },
   assignee: { select: { id: true, name: true, avatarUrl: true } },
} as const;

@Injectable()
export class IssuesService {
   constructor(private readonly prisma: PrismaService) {}

   async list(
      workspaceId: string,
      userId: string,
      teamId?: string,
      categories?: IssueStatusCategory[]
   ) {
      await this.authorize(workspaceId, userId, teamId);
      return this.prisma.issue.findMany({
         where: {
            workspaceId,
            archivedAt: null,
            ...(teamId ? { teamId } : {}),
            ...(categories?.length ? { status: { category: { in: categories } } } : {}),
         },
         include: issueInclude,
         orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      });
   }

   async create(dto: CreateIssueDto, userId: string) {
      await this.authorize(dto.workspaceId, userId, dto.teamId);
      return this.prisma.$transaction(async (tx) => {
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

   private async authorize(workspaceId: string, userId: string, teamId?: string) {
      const membership = await this.prisma.workspaceMember.findFirst({
         where: { workspaceId, userId, status: 'ACTIVE' },
      });
      if (!membership) throw new ForbiddenException('You do not have access to this workspace.');
      if (!teamId) return;
      const team = await this.prisma.team.findFirst({
         where: { id: teamId, workspaceId, members: { some: { userId } } },
      });
      if (!team) throw new ForbiddenException('You do not have access to this team.');
   }
}
