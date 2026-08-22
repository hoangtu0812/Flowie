import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateLabelDto } from './dto/create-label.dto';

@Injectable()
export class LabelsService {
   constructor(private readonly prisma: PrismaService) {}

   async list(workspaceId: string, userId: string) {
      await this.authorize(workspaceId, userId);
      return this.prisma.label.findMany({
         where: { workspaceId },
         include: { _count: { select: { issueLinks: true } } },
         orderBy: { name: 'asc' },
      });
   }

   async create(dto: CreateLabelDto, userId: string) {
      await this.authorize(dto.workspaceId, userId);
      return this.prisma.label.create({
         data: { ...dto, name: dto.name.trim() },
         include: { _count: { select: { issueLinks: true } } },
      });
   }

   private async authorize(workspaceId: string, userId: string) {
      const membership = await this.prisma.workspaceMember.findFirst({
         where: { workspaceId, userId, status: 'ACTIVE' },
      });
      if (!membership) throw new ForbiddenException('You do not have access to this workspace.');
   }
}
