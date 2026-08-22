import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateProjectDto } from './dto/create-project.dto';
@Injectable()
export class ProjectsService {
   constructor(private readonly prisma: PrismaService) {}
   async list(workspaceId: string, userId: string) {
      await this.authorize(workspaceId, userId);
      return this.prisma.project.findMany({
         where: { workspaceId, archivedAt: null },
         include: { team: true },
         orderBy: { createdAt: 'desc' },
      });
   }
   async create(dto: CreateProjectDto, userId: string) {
      await this.authorize(dto.workspaceId, userId);
      return this.prisma.project.create({
         data: { ...dto, identifier: dto.identifier.toUpperCase() },
         include: { team: true },
      });
   }
   private async authorize(workspaceId: string, userId: string) {
      if (
         !(await this.prisma.workspaceMember.findFirst({
            where: { workspaceId, userId, status: 'ACTIVE' },
         }))
      )
         throw new ForbiddenException('You do not have access to this workspace.');
   }
}
