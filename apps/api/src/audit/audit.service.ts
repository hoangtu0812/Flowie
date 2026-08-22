import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@circle/database';
import { PrismaService } from '../database/prisma.service';

export type AuditRecord = {
   workspaceId?: string;
   actorId?: string;
   action: string;
   entityType: string;
   entityId?: string;
   metadata?: Record<string, unknown>;
};

@Injectable()
export class AuditService {
   constructor(private readonly prisma: PrismaService) {}

   record(record: AuditRecord): Promise<unknown> {
      return this.prisma.auditLog.create({
         data: {
            workspaceId: record.workspaceId,
            actorId: record.actorId,
            action: record.action,
            entityType: record.entityType,
            entityId: record.entityId,
            metadata: (record.metadata ?? {}) as Prisma.InputJsonValue,
         },
      });
   }

   async platformLogs(): Promise<unknown> {
      return this.prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 200 });
   }

   async workspaceLogs(workspaceId: string, userId: string): Promise<unknown> {
      const membership = await this.prisma.workspaceMember.findFirst({
         where: { workspaceId, userId, status: 'ACTIVE', role: { in: ['OWNER', 'ADMIN'] } },
      });
      if (!membership) throw new ForbiddenException('Workspace administrator access is required.');
      return this.prisma.auditLog.findMany({
         where: { workspaceId },
         orderBy: { createdAt: 'desc' },
         take: 200,
      });
   }
}
