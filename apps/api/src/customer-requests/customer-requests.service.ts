import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../database/prisma.service';
import { CreateCustomerRequestDto } from './dto/create-customer-request.dto';
import { UpdateCustomerRequestDto } from './dto/update-customer-request.dto';

const customerRequestInclude = {
   createdBy: { select: { id: true, name: true, avatarUrl: true } },
   project: { select: { id: true, name: true, identifier: true } },
   issue: { select: { id: true, identifier: true, title: true } },
} as const;

@Injectable()
export class CustomerRequestsService {
   constructor(
      private readonly prisma: PrismaService,
      private readonly audit: AuditService
   ) {}

   async list(workspaceId: string, userId: string) {
      await this.authorize(workspaceId, userId);
      return this.prisma.customerRequest.findMany({
         where: { workspaceId, archivedAt: null },
         include: customerRequestInclude,
         orderBy: { updatedAt: 'desc' },
      });
   }

   async create(dto: CreateCustomerRequestDto, userId: string) {
      await this.authorize(dto.workspaceId, userId);
      await this.assertReferences(dto.workspaceId, dto.projectId, dto.issueId);
      const request = await this.prisma.customerRequest.create({
         data: {
            workspaceId: dto.workspaceId,
            title: dto.title.trim(),
            description: dto.description?.trim() || null,
            customer: dto.customer.trim(),
            source: dto.source ?? 'manual',
            status: dto.status ?? 'open',
            priority: dto.priority ?? 'none',
            projectId: dto.projectId || null,
            issueId: dto.issueId || null,
            createdById: userId,
         },
         include: customerRequestInclude,
      });
      await this.audit.record({
         workspaceId: dto.workspaceId,
         actorId: userId,
         action: 'customer-request.created',
         entityType: 'customer-request',
         entityId: request.id,
         metadata: { title: request.title, customer: request.customer },
      });
      return request;
   }

   async update(
      requestId: string,
      workspaceId: string,
      dto: UpdateCustomerRequestDto,
      userId: string
   ) {
      const membership = await this.authorize(workspaceId, userId);
      const existing = await this.prisma.customerRequest.findFirst({
         where: { id: requestId, workspaceId, archivedAt: null },
      });
      if (!existing) throw new NotFoundException('Customer request not found.');
      this.assertCanManage(existing.createdById, membership.role, userId);
      await this.assertReferences(workspaceId, dto.projectId, dto.issueId);
      const updated = await this.prisma.customerRequest.update({
         where: { id: requestId },
         data: {
            ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
            ...(dto.description !== undefined
               ? { description: dto.description?.trim() || null }
               : {}),
            ...(dto.customer !== undefined ? { customer: dto.customer.trim() } : {}),
            ...(dto.source !== undefined ? { source: dto.source } : {}),
            ...(dto.status !== undefined ? { status: dto.status } : {}),
            ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
            ...(dto.projectId !== undefined ? { projectId: dto.projectId || null } : {}),
            ...(dto.issueId !== undefined ? { issueId: dto.issueId || null } : {}),
         },
         include: customerRequestInclude,
      });
      await this.audit.record({
         workspaceId,
         actorId: userId,
         action: 'customer-request.updated',
         entityType: 'customer-request',
         entityId: requestId,
         metadata: Object.fromEntries(
            Object.entries(dto).filter(([, value]) => value !== undefined)
         ),
      });
      return updated;
   }

   async archive(requestId: string, workspaceId: string, userId: string) {
      const membership = await this.authorize(workspaceId, userId);
      const request = await this.prisma.customerRequest.findFirst({
         where: { id: requestId, workspaceId, archivedAt: null },
      });
      if (!request) throw new NotFoundException('Customer request not found.');
      this.assertCanManage(request.createdById, membership.role, userId);
      const archived = await this.prisma.customerRequest.update({
         where: { id: requestId },
         data: { archivedAt: new Date() },
      });
      await this.audit.record({
         workspaceId,
         actorId: userId,
         action: 'customer-request.archived',
         entityType: 'customer-request',
         entityId: requestId,
         metadata: { title: request.title, customer: request.customer },
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
         throw new ForbiddenException('Only the creator or a workspace administrator can edit this request.');
      }
   }

   private async assertReferences(
      workspaceId: string,
      projectId: string | null | undefined,
      issueId: string | null | undefined
   ) {
      if (projectId) {
         const project = await this.prisma.project.findFirst({
            where: { id: projectId, workspaceId, archivedAt: null },
            select: { id: true },
         });
         if (!project) throw new NotFoundException('Project not found in this workspace.');
      }
      if (issueId) {
         const issue = await this.prisma.issue.findFirst({
            where: { id: issueId, workspaceId, archivedAt: null },
            select: { id: true },
         });
         if (!issue) throw new NotFoundException('Issue not found in this workspace.');
      }
   }
}
