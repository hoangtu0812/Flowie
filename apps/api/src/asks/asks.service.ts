import {
   BadRequestException,
   ForbiddenException,
   Injectable,
   NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../database/prisma.service';
import { IssuesService } from '../issues/issues.service';
import { CreateAskDto } from './dto/create-ask.dto';
import { UpdateAskDto } from './dto/update-ask.dto';

const askInclude = {
   team: { select: { id: true, name: true, identifier: true, icon: true } },
   project: { select: { id: true, name: true, identifier: true } },
   createdBy: { select: { id: true, name: true, avatarUrl: true } },
   convertedIssue: { select: { id: true, identifier: true, title: true } },
} as const;

@Injectable()
export class AsksService {
   constructor(
      private readonly prisma: PrismaService,
      private readonly audit: AuditService,
      private readonly issues: IssuesService
   ) {}

   async list(workspaceId: string, userId: string) {
      await this.authorize(workspaceId, userId);
      return this.prisma.ask.findMany({
         where: {
            workspaceId,
            archivedAt: null,
            team: { members: { some: { userId } } },
         },
         include: askInclude,
         orderBy: { updatedAt: 'desc' },
      });
   }

   async create(dto: CreateAskDto, userId: string) {
      await this.authorize(dto.workspaceId, userId);
      await this.assertReferences(dto.workspaceId, dto.teamId, dto.projectId, userId);
      const ask = await this.prisma.ask.create({
         data: {
            workspaceId: dto.workspaceId,
            teamId: dto.teamId,
            projectId: dto.projectId || null,
            title: dto.title.trim(),
            description: dto.description?.trim() || null,
            priority: dto.priority ?? 'NONE',
            createdById: userId,
         },
         include: askInclude,
      });
      await this.audit.record({
         workspaceId: dto.workspaceId,
         actorId: userId,
         action: 'ask.created',
         entityType: 'ask',
         entityId: ask.id,
         metadata: { title: ask.title, teamId: ask.teamId },
      });
      return ask;
   }

   async update(askId: string, workspaceId: string, dto: UpdateAskDto, userId: string) {
      const membership = await this.authorize(workspaceId, userId);
      const ask = await this.prisma.ask.findFirst({
         where: { id: askId, workspaceId, archivedAt: null },
      });
      if (!ask) throw new NotFoundException('Ask not found.');
      this.assertCanManage(ask.createdById, membership.role, userId);
      if (ask.convertedIssueId) throw new BadRequestException('Converted asks cannot be edited.');
      if (dto.status === 'accepted') {
         throw new BadRequestException('Use the convert action to accept an Ask.');
      }
      const targetTeamId = dto.teamId ?? ask.teamId;
      const targetProjectId = dto.projectId === undefined ? ask.projectId : dto.projectId;
      await this.assertReferences(workspaceId, targetTeamId, targetProjectId, userId);
      const updated = await this.prisma.ask.update({
         where: { id: askId },
         data: {
            ...(dto.teamId !== undefined ? { teamId: dto.teamId } : {}),
            ...(dto.projectId !== undefined ? { projectId: dto.projectId || null } : {}),
            ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
            ...(dto.description !== undefined
               ? { description: dto.description?.trim() || null }
               : {}),
            ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
            ...(dto.status !== undefined ? { status: dto.status } : {}),
         },
         include: askInclude,
      });
      await this.audit.record({
         workspaceId,
         actorId: userId,
         action: 'ask.updated',
         entityType: 'ask',
         entityId: askId,
         metadata: Object.fromEntries(
            Object.entries(dto).filter(([, value]) => value !== undefined)
         ),
      });
      return updated;
   }

   async convert(askId: string, workspaceId: string, userId: string) {
      const membership = await this.authorize(workspaceId, userId);
      const ask = await this.prisma.ask.findFirst({
         where: { id: askId, workspaceId, archivedAt: null },
         include: askInclude,
      });
      if (!ask) throw new NotFoundException('Ask not found.');
      this.assertCanManage(ask.createdById, membership.role, userId);
      if (ask.convertedIssueId) return ask;
      if (ask.status === 'declined') {
         throw new BadRequestException('Declined asks cannot be converted.');
      }
      const issue = await this.issues.create(
         {
            workspaceId,
            teamId: ask.teamId,
            projectId: ask.projectId ?? undefined,
            title: ask.title,
            description: ask.description ?? undefined,
            priority: ask.priority,
         },
         userId
      );
      const converted = await this.prisma.ask.update({
         where: { id: askId },
         data: { status: 'accepted', convertedIssueId: issue.id },
         include: askInclude,
      });
      await this.audit.record({
         workspaceId,
         actorId: userId,
         action: 'ask.converted',
         entityType: 'ask',
         entityId: askId,
         metadata: { issueId: issue.id, identifier: issue.identifier },
      });
      return converted;
   }

   async archive(askId: string, workspaceId: string, userId: string) {
      const membership = await this.authorize(workspaceId, userId);
      const ask = await this.prisma.ask.findFirst({
         where: { id: askId, workspaceId, archivedAt: null },
      });
      if (!ask) throw new NotFoundException('Ask not found.');
      this.assertCanManage(ask.createdById, membership.role, userId);
      const archived = await this.prisma.ask.update({
         where: { id: askId },
         data: { archivedAt: new Date() },
      });
      await this.audit.record({
         workspaceId,
         actorId: userId,
         action: 'ask.archived',
         entityType: 'ask',
         entityId: askId,
         metadata: { title: ask.title },
      });
      return archived;
   }

   private async authorize(workspaceId: string, userId: string) {
      const membership = await this.prisma.workspaceMember.findFirst({
         where: { workspaceId, userId, status: 'ACTIVE' },
         select: { role: true },
      });
      if (!membership) throw new ForbiddenException('You do not have access to this workspace.');
      return membership;
   }

   private assertCanManage(createdById: string, role: string, userId: string) {
      if (createdById !== userId && role !== 'OWNER' && role !== 'ADMIN') {
         throw new ForbiddenException('Only the creator or a workspace administrator can manage this Ask.');
      }
   }

   private async assertReferences(
      workspaceId: string,
      teamId: string,
      projectId: string | null | undefined,
      userId: string
   ) {
      const team = await this.prisma.team.findFirst({
         where: {
            id: teamId,
            workspaceId,
            archivedAt: null,
            members: { some: { userId } },
         },
         select: { id: true },
      });
      if (!team) throw new NotFoundException('Ask team not found or not accessible.');
      if (!projectId) return;
      const project = await this.prisma.project.findFirst({
         where: {
            id: projectId,
            workspaceId,
            archivedAt: null,
            OR: [{ teamId: null }, { teamId }],
         },
         select: { id: true },
      });
      if (!project) throw new NotFoundException('Ask project not found for this team.');
   }
}
