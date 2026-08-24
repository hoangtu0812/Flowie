import {
   BadRequestException,
   ForbiddenException,
   Injectable,
   NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@circle/database';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../database/prisma.service';
import { CreateReleaseDto } from './dto/create-release.dto';
import { UpdateReleaseDto } from './dto/update-release.dto';

const releaseInclude = {
   createdBy: { select: { id: true, name: true, avatarUrl: true } },
   projectLinks: {
      include: {
         project: { select: { id: true, name: true, identifier: true, status: true } },
      },
      orderBy: { createdAt: 'asc' as const },
   },
} as const;

@Injectable()
export class ReleasesService {
   constructor(
      private readonly prisma: PrismaService,
      private readonly audit: AuditService
   ) {}

   async list(workspaceId: string, userId: string) {
      await this.authorize(workspaceId, userId);
      return this.prisma.release.findMany({
         where: { workspaceId, archivedAt: null },
         include: releaseInclude,
         orderBy: [{ targetDate: 'desc' }, { updatedAt: 'desc' }],
      });
   }

   async create(dto: CreateReleaseDto, userId: string) {
      await this.authorizeManager(dto.workspaceId, userId);
      const projectIds = [...new Set(dto.projectIds ?? [])];
      await this.assertProjects(dto.workspaceId, projectIds);
      try {
         const release = await this.prisma.release.create({
            data: {
               workspaceId: dto.workspaceId,
               name: dto.name.trim(),
               version: dto.version.trim(),
               description: dto.description?.trim() || null,
               status: dto.status ?? 'planned',
               targetDate: dto.targetDate ? new Date(dto.targetDate) : null,
               releasedAt: dto.status === 'released' ? new Date() : null,
               createdById: userId,
               projectLinks: {
                  create: projectIds.map((projectId) => ({ projectId })),
               },
            },
            include: releaseInclude,
         });
         await this.audit.record({
            workspaceId: dto.workspaceId,
            actorId: userId,
            action: 'release.created',
            entityType: 'release',
            entityId: release.id,
            metadata: { name: release.name, version: release.version, projectIds },
         });
         return release;
      } catch (error) {
         this.handleUniqueVersion(error);
      }
   }

   async update(
      releaseId: string,
      workspaceId: string,
      dto: UpdateReleaseDto,
      userId: string
   ) {
      await this.authorizeManager(workspaceId, userId);
      const existing = await this.prisma.release.findFirst({
         where: { id: releaseId, workspaceId, archivedAt: null },
      });
      if (!existing) throw new NotFoundException('Release not found.');
      const projectIds = dto.projectIds === undefined ? undefined : [...new Set(dto.projectIds)];
      if (projectIds) await this.assertProjects(workspaceId, projectIds);

      try {
         await this.prisma.$transaction(async (transaction) => {
            await transaction.release.update({
               where: { id: releaseId },
               data: {
                  ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
                  ...(dto.version !== undefined ? { version: dto.version.trim() } : {}),
                  ...(dto.description !== undefined
                     ? { description: dto.description?.trim() || null }
                     : {}),
                  ...(dto.status !== undefined
                     ? {
                          status: dto.status,
                          releasedAt:
                             dto.status === 'released'
                                ? (existing.releasedAt ?? new Date())
                                : null,
                       }
                     : {}),
                  ...(dto.targetDate !== undefined
                     ? { targetDate: dto.targetDate ? new Date(dto.targetDate) : null }
                     : {}),
               },
            });
            if (projectIds !== undefined) {
               await transaction.releaseProject.deleteMany({ where: { releaseId } });
               if (projectIds.length > 0) {
                  await transaction.releaseProject.createMany({
                     data: projectIds.map((projectId) => ({ releaseId, projectId })),
                  });
               }
            }
         });
         const release = await this.prisma.release.findUniqueOrThrow({
            where: { id: releaseId },
            include: releaseInclude,
         });
         await this.audit.record({
            workspaceId,
            actorId: userId,
            action: 'release.updated',
            entityType: 'release',
            entityId: releaseId,
            metadata: {
               ...Object.fromEntries(
                  Object.entries(dto).filter(([key, value]) => key !== 'projectIds' && value !== undefined)
               ),
               ...(projectIds === undefined ? {} : { projectIds }),
            },
         });
         return release;
      } catch (error) {
         this.handleUniqueVersion(error);
      }
   }

   async archive(releaseId: string, workspaceId: string, userId: string) {
      await this.authorizeManager(workspaceId, userId);
      const release = await this.prisma.release.findFirst({
         where: { id: releaseId, workspaceId, archivedAt: null },
      });
      if (!release) throw new NotFoundException('Release not found.');
      const archived = await this.prisma.release.update({
         where: { id: releaseId },
         data: { archivedAt: new Date() },
      });
      await this.audit.record({
         workspaceId,
         actorId: userId,
         action: 'release.archived',
         entityType: 'release',
         entityId: releaseId,
         metadata: { name: release.name, version: release.version },
      });
      return archived;
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

   private async assertProjects(workspaceId: string, projectIds: string[]) {
      if (projectIds.length === 0) return;
      const count = await this.prisma.project.count({
         where: { id: { in: projectIds }, workspaceId, archivedAt: null },
      });
      if (count !== projectIds.length) {
         throw new BadRequestException('Every release project must belong to this workspace.');
      }
   }

   private handleUniqueVersion(error: unknown): never {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
         throw new BadRequestException('A release with this version already exists.');
      }
      throw error;
   }
}
