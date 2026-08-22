import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class WorkspaceService {
   constructor(private readonly prisma: PrismaService) {}

   async listForUser(userId: string) {
      return this.prisma.workspaceMember.findMany({
         where: { userId, status: 'ACTIVE' },
         include: { workspace: { include: { organization: true } } },
         orderBy: { createdAt: 'asc' },
      });
   }

   async members(workspaceId: string, userId: string) {
      const membership = await this.prisma.workspaceMember.findFirst({
         where: { workspaceId, userId, status: 'ACTIVE' },
      });
      if (!membership) throw new NotFoundException('Workspace not found.');
      return this.prisma.workspaceMember.findMany({
         where: { workspaceId },
         include: { user: true },
         orderBy: { createdAt: 'asc' },
      });
   }
}
