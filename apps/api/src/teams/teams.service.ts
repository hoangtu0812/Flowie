import {
   ConflictException,
   ForbiddenException,
   Injectable,
   NotFoundException,
} from '@nestjs/common';
import { TeamMemberRole } from '@circle/database';
import { PrismaService } from '../database/prisma.service';
import { CreateTeamDto } from './dto/create-team.dto';
import { UpdateTeamDto } from './dto/update-team.dto';
import { AddTeamMemberDto } from './dto/add-team-member.dto';

@Injectable()
export class TeamsService {
   constructor(private readonly prisma: PrismaService) {}
   async list(workspaceId: string, userId: string) {
      await this.authorize(workspaceId, userId);
      return this.prisma.team.findMany({
         where: { workspaceId, archivedAt: null, members: { some: { userId } } },
         include: { members: { include: { user: true } } },
         orderBy: { name: 'asc' },
      });
   }
   async create(dto: CreateTeamDto, userId: string) {
      await this.authorizeManager(dto.workspaceId, userId);
      return this.prisma.team.create({
         data: { ...dto, members: { create: { userId, role: 'LEAD' } } },
         include: { members: { include: { user: true } } },
      });
   }
   async get(teamId: string, workspaceId: string, userId: string) {
      await this.authorize(workspaceId, userId);
      const team = await this.prisma.team.findFirst({
         where: { id: teamId, workspaceId, archivedAt: null, members: { some: { userId } } },
         include: {
            members: { include: { user: true } },
            _count: { select: { issues: true, projects: true, cycles: true } },
         },
      });
      if (!team) throw new NotFoundException('Team not found.');
      return team;
   }
   async update(teamId: string, workspaceId: string, dto: UpdateTeamDto, userId: string) {
      await this.authorizeManager(workspaceId, userId);
      const team = await this.prisma.team.findFirst({
         where: { id: teamId, workspaceId, archivedAt: null },
      });
      if (!team) throw new NotFoundException('Team not found.');
      return this.prisma.team.update({
         where: { id: teamId },
         data: dto,
         include: { members: { include: { user: true } } },
      });
   }
   async archive(teamId: string, workspaceId: string, userId: string) {
      await this.authorizeManager(workspaceId, userId);
      const team = await this.prisma.team.findFirst({
         where: { id: teamId, workspaceId, archivedAt: null },
      });
      if (!team) throw new NotFoundException('Team not found.');
      return this.prisma.team.update({ where: { id: teamId }, data: { archivedAt: new Date() } });
   }
   async addMember(teamId: string, dto: AddTeamMemberDto, userId: string) {
      await this.authorizeManager(dto.workspaceId, userId);
      const team = await this.prisma.team.findFirst({
         where: { id: teamId, workspaceId: dto.workspaceId, archivedAt: null },
      });
      if (!team) throw new NotFoundException('Team not found.');
      const workspaceMember = await this.prisma.workspaceMember.findFirst({
         where: { workspaceId: dto.workspaceId, userId: dto.userId, status: 'ACTIVE' },
      });
      if (!workspaceMember) throw new NotFoundException('Workspace member not found.');
      const existing = await this.prisma.teamMember.findUnique({
         where: { teamId_userId: { teamId, userId: dto.userId } },
      });
      if (existing) throw new ConflictException('This person is already in the team.');
      return this.prisma.teamMember.create({
         data: { teamId, userId: dto.userId, role: dto.role },
         include: { user: true },
      });
   }
   async updateMember(
      teamId: string,
      targetUserId: string,
      workspaceId: string,
      role: TeamMemberRole,
      userId: string
   ) {
      await this.authorizeManager(workspaceId, userId);
      const member = await this.prisma.teamMember.findFirst({
         where: { teamId, userId: targetUserId, team: { workspaceId, archivedAt: null } },
      });
      if (!member) throw new NotFoundException('Team member not found.');
      return this.prisma.teamMember.update({
         where: { teamId_userId: { teamId, userId: targetUserId } },
         data: { role },
         include: { user: true },
      });
   }
   async removeMember(teamId: string, targetUserId: string, workspaceId: string, userId: string) {
      await this.authorizeManager(workspaceId, userId);
      const member = await this.prisma.teamMember.findFirst({
         where: { teamId, userId: targetUserId, team: { workspaceId, archivedAt: null } },
      });
      if (!member) throw new NotFoundException('Team member not found.');
      await this.prisma.teamMember.delete({
         where: { teamId_userId: { teamId, userId: targetUserId } },
      });
      return { teamId, userId: targetUserId, removed: true };
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
}
