import {
   BadRequestException,
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

const teamMemberUser = {
   select: { id: true, name: true, email: true, avatarUrl: true, title: true },
} as const;

const teamDetailInclude = {
   members: { include: { user: teamMemberUser } },
   _count: { select: { issues: true, projects: true, cycles: true, documents: true } },
} as const;

@Injectable()
export class TeamsService {
   constructor(private readonly prisma: PrismaService) {}
   async list(workspaceId: string, userId: string) {
      await this.authorize(workspaceId, userId);
      const teams = await this.prisma.team.findMany({
         where: { workspaceId, archivedAt: null },
         include: {
            members: {
               select: {
                  role: true,
                  user: { select: { id: true, name: true, avatarUrl: true } },
               },
            },
            _count: { select: { projects: true, cycles: true } },
         },
         orderBy: { name: 'asc' },
      });
      return teams.map((team) => ({
         ...team,
         joined: team.members.some((member) => member.user.id === userId),
      }));
   }
   async create(dto: CreateTeamDto, userId: string) {
      await this.authorizeManager(dto.workspaceId, userId);
      return this.prisma.team.create({
         data: { ...dto, members: { create: { userId, role: 'LEAD' } } },
          include: teamDetailInclude,
      });
   }
   async get(teamId: string, workspaceId: string, userId: string) {
      await this.authorize(workspaceId, userId);
      const team = await this.prisma.team.findFirst({
         where: { id: teamId, workspaceId, archivedAt: null, members: { some: { userId } } },
          include: teamDetailInclude,
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
      if (dto.defaultIssueTemplateId) {
         const template = await this.prisma.issueTemplate.findFirst({
            where: { id: dto.defaultIssueTemplateId, workspaceId },
         });
         if (!template) throw new NotFoundException('Issue template not found.');
      }
      if (dto.parentTeamId) {
         if (dto.parentTeamId === teamId) {
            throw new BadRequestException('A team cannot be its own parent.');
         }
         let parent = await this.prisma.team.findFirst({
            where: { id: dto.parentTeamId, workspaceId, archivedAt: null },
            select: { id: true, parentTeamId: true },
         });
         if (!parent) throw new NotFoundException('Parent team not found.');
         while (parent.parentTeamId) {
            if (parent.parentTeamId === teamId) {
               throw new BadRequestException('Team hierarchy cannot contain a cycle.');
            }
            parent = await this.prisma.team.findFirst({
               where: { id: parent.parentTeamId, workspaceId, archivedAt: null },
               select: { id: true, parentTeamId: true },
            });
            if (!parent) break;
         }
      }
      const autoCloseDays = dto.autoCloseDays ?? team.autoCloseDays;
      const autoArchiveDays = dto.autoArchiveDays ?? team.autoArchiveDays;
      if (autoCloseDays && autoArchiveDays && autoArchiveDays < autoCloseDays) {
         throw new BadRequestException('Auto-archive must not run before auto-close.');
      }
      return this.prisma.team.update({
         where: { id: teamId },
         data: dto,
          include: teamDetailInclude,
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
          include: { user: teamMemberUser },
      });
   }
   async join(teamId: string, workspaceId: string, userId: string) {
      await this.authorize(workspaceId, userId);
      const team = await this.prisma.team.findFirst({
         where: { id: teamId, workspaceId, archivedAt: null },
         select: { id: true },
      });
      if (!team) throw new NotFoundException('Team not found.');
      return this.prisma.teamMember.upsert({
         where: { teamId_userId: { teamId, userId } },
         create: { teamId, userId, role: 'MEMBER' },
         update: {},
         include: { user: teamMemberUser },
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
          include: { user: teamMemberUser },
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
