import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateTeamDto } from './dto/create-team.dto';

@Injectable()
export class TeamsService {
   constructor(private readonly prisma: PrismaService) {}
   async list(workspaceId: string, userId: string) {
      await this.authorize(workspaceId, userId);
      return this.prisma.team.findMany({
         where: { workspaceId, members: { some: { userId } } },
         include: { members: { include: { user: true } } },
         orderBy: { name: 'asc' },
      });
   }
   async create(dto: CreateTeamDto, userId: string) {
      await this.authorize(dto.workspaceId, userId);
      return this.prisma.team.create({
         data: { ...dto, members: { create: { userId, role: 'LEAD' } } },
         include: { members: { include: { user: true } } },
      });
   }
   private async authorize(workspaceId: string, userId: string) {
      const membership = await this.prisma.workspaceMember.findFirst({
         where: { workspaceId, userId, status: 'ACTIVE' },
      });
      if (!membership) throw new ForbiddenException('You do not have access to this workspace.');
   }
}
