import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { IssuePriority } from '@circle/database';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../database/prisma.service';
import { CreateSlaPolicyDto } from './dto/create-sla-policy.dto';
import { UpdateSlaPolicyDto } from './dto/update-sla-policy.dto';

const slaInclude = {
   team: { select: { id: true, name: true, identifier: true, icon: true } },
   createdBy: { select: { id: true, name: true, avatarUrl: true } },
} as const;

@Injectable()
export class SlasService {
   constructor(
      private readonly prisma: PrismaService,
      private readonly audit: AuditService
   ) {}

   async list(workspaceId: string, userId: string) {
      await this.authorize(workspaceId, userId);
      return this.prisma.slaPolicy.findMany({
         where: { workspaceId, archivedAt: null },
         include: slaInclude,
         orderBy: [{ enabled: 'desc' }, { updatedAt: 'desc' }],
      });
   }

   async create(dto: CreateSlaPolicyDto, userId: string) {
      await this.authorizeManager(dto.workspaceId, userId);
      await this.assertTeam(dto.workspaceId, dto.teamId);
      const policy = await this.prisma.slaPolicy.create({
         data: {
            workspaceId: dto.workspaceId,
            name: dto.name.trim(),
            description: dto.description?.trim() || null,
            teamId: dto.teamId || null,
            priority: dto.priority || null,
            deadlineMinutes: dto.deadlineMinutes,
            enabled: dto.enabled ?? true,
            createdById: userId,
         },
         include: slaInclude,
      });
      await this.audit.record({
         workspaceId: dto.workspaceId,
         actorId: userId,
         action: 'sla-policy.created',
         entityType: 'sla-policy',
         entityId: policy.id,
         metadata: { name: policy.name, deadlineMinutes: policy.deadlineMinutes },
      });
      return policy;
   }

   async update(
      policyId: string,
      workspaceId: string,
      dto: UpdateSlaPolicyDto,
      userId: string
   ) {
      await this.authorizeManager(workspaceId, userId);
      const existing = await this.prisma.slaPolicy.findFirst({
         where: { id: policyId, workspaceId, archivedAt: null },
      });
      if (!existing) throw new NotFoundException('SLA policy not found.');
      await this.assertTeam(workspaceId, dto.teamId);
      const policy = await this.prisma.slaPolicy.update({
         where: { id: policyId },
         data: {
            ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
            ...(dto.description !== undefined
               ? { description: dto.description?.trim() || null }
               : {}),
            ...(dto.teamId !== undefined ? { teamId: dto.teamId || null } : {}),
            ...(dto.priority !== undefined ? { priority: dto.priority || null } : {}),
            ...(dto.deadlineMinutes !== undefined
               ? { deadlineMinutes: dto.deadlineMinutes }
               : {}),
            ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
         },
         include: slaInclude,
      });
      await this.audit.record({
         workspaceId,
         actorId: userId,
         action: 'sla-policy.updated',
         entityType: 'sla-policy',
         entityId: policyId,
         metadata: Object.fromEntries(
            Object.entries(dto).filter(([, value]) => value !== undefined)
         ),
      });
      return policy;
   }

   async archive(policyId: string, workspaceId: string, userId: string) {
      await this.authorizeManager(workspaceId, userId);
      const policy = await this.prisma.slaPolicy.findFirst({
         where: { id: policyId, workspaceId, archivedAt: null },
      });
      if (!policy) throw new NotFoundException('SLA policy not found.');
      const archived = await this.prisma.slaPolicy.update({
         where: { id: policyId },
         data: { archivedAt: new Date() },
      });
      await this.audit.record({
         workspaceId,
         actorId: userId,
         action: 'sla-policy.archived',
         entityType: 'sla-policy',
         entityId: policyId,
         metadata: { name: policy.name },
      });
      return archived;
   }

   async resolveDeadline(
      workspaceId: string,
      teamId: string,
      priority: IssuePriority,
      baseDate = new Date()
   ): Promise<{ dueDate: Date; policyId: string } | undefined> {
      const policies = await this.prisma.slaPolicy.findMany({
         where: {
            workspaceId,
            archivedAt: null,
            enabled: true,
            OR: [{ teamId: null }, { teamId }],
            AND: [{ OR: [{ priority: null }, { priority }] }],
         },
         orderBy: { createdAt: 'asc' },
      });
      const policy = policies.sort((left, right) => {
         const score = (value: typeof left) =>
            (value.teamId === teamId ? 2 : 0) + (value.priority === priority ? 1 : 0);
         return score(right) - score(left);
      })[0];
      if (!policy) return undefined;
      return {
         dueDate: new Date(baseDate.getTime() + policy.deadlineMinutes * 60_000),
         policyId: policy.id,
      };
   }

   private async authorize(workspaceId: string, userId: string) {
      const membership = await this.prisma.workspaceMember.findFirst({
         where: { workspaceId, userId, status: 'ACTIVE' },
      });
      if (!membership) throw new ForbiddenException('You do not have access to this workspace.');
   }

   private async authorizeManager(workspaceId: string, userId: string) {
      const membership = await this.prisma.workspaceMember.findFirst({
         where: { workspaceId, userId, status: 'ACTIVE', role: { in: ['OWNER', 'ADMIN'] } },
      });
      if (!membership) throw new ForbiddenException('Workspace administrator access is required.');
   }

   private async assertTeam(workspaceId: string, teamId: string | null | undefined) {
      if (!teamId) return;
      const team = await this.prisma.team.findFirst({
         where: { id: teamId, workspaceId, archivedAt: null },
         select: { id: true },
      });
      if (!team) throw new NotFoundException('SLA team not found in this workspace.');
   }
}
