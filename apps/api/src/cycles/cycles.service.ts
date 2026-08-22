import {
   BadRequestException,
   ForbiddenException,
   Injectable,
   NotFoundException,
} from '@nestjs/common';
import { CycleStatus } from '@circle/database';
import { PrismaService } from '../database/prisma.service';
import { AddIssueToCycleDto } from './dto/add-issue-to-cycle.dto';
import { CreateCycleDto } from './dto/create-cycle.dto';
import { UpdateCycleDto } from './dto/update-cycle.dto';

@Injectable()
export class CyclesService {
   constructor(private readonly prisma: PrismaService) {}

   async list(workspaceId: string, teamId: string, userId: string, status?: CycleStatus) {
      await this.authorize(workspaceId, teamId, userId);
      return this.prisma.cycle.findMany({
         where: { workspaceId, teamId, ...(status ? { status } : {}) },
         include: { _count: { select: { issueLinks: true } } },
         orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
      });
   }

   async create(dto: CreateCycleDto, userId: string) {
      await this.authorize(dto.workspaceId, dto.teamId, userId);
      this.validateDates(dto.startDate, dto.endDate);
      return this.prisma.cycle.create({
         data: {
            ...dto,
            startDate: dto.startDate ? new Date(dto.startDate) : undefined,
            endDate: dto.endDate ? new Date(dto.endDate) : undefined,
         },
         include: { _count: { select: { issueLinks: true } } },
      });
   }

   async update(cycleId: string, workspaceId: string, dto: UpdateCycleDto, userId: string) {
      const cycle = await this.findAuthorizedCycle(cycleId, workspaceId, userId);
      this.validateDates(
         dto.startDate ?? cycle.startDate?.toISOString(),
         dto.endDate ?? cycle.endDate?.toISOString()
      );
      return this.prisma.cycle.update({
         where: { id: cycleId },
         data: {
            ...dto,
            startDate: dto.startDate ? new Date(dto.startDate) : undefined,
            endDate: dto.endDate ? new Date(dto.endDate) : undefined,
         },
         include: { _count: { select: { issueLinks: true } } },
      });
   }

   async addIssue(cycleId: string, dto: AddIssueToCycleDto, userId: string) {
      const cycle = await this.findAuthorizedCycle(cycleId, dto.workspaceId, userId);
      const issue = await this.prisma.issue.findFirst({
         where: {
            id: dto.issueId,
            workspaceId: dto.workspaceId,
            teamId: cycle.teamId,
            archivedAt: null,
         },
      });
      if (!issue) throw new NotFoundException('Issue not found for this team.');
      return this.prisma.issueCycle.upsert({
         where: { issueId_cycleId: { issueId: issue.id, cycleId: cycle.id } },
         create: { issueId: issue.id, cycleId: cycle.id },
         update: {},
      });
   }

   async issues(cycleId: string, workspaceId: string, userId: string) {
      const cycle = await this.findAuthorizedCycle(cycleId, workspaceId, userId);
      const links = await this.prisma.issueCycle.findMany({
         where: { cycleId: cycle.id },
         include: {
            issue: {
               include: {
                  status: { select: { name: true, color: true } },
                  assignee: { select: { name: true } },
               },
            },
         },
         orderBy: { createdAt: 'desc' },
      });
      return links.map((link) => link.issue);
   }

   private async findAuthorizedCycle(cycleId: string, workspaceId: string, userId: string) {
      const cycle = await this.prisma.cycle.findFirst({ where: { id: cycleId, workspaceId } });
      if (!cycle) throw new NotFoundException('Cycle not found.');
      await this.authorize(workspaceId, cycle.teamId, userId);
      return cycle;
   }

   private async authorize(workspaceId: string, teamId: string, userId: string) {
      const allowed = await this.prisma.workspaceMember.findFirst({
         where: { workspaceId, userId, status: 'ACTIVE' },
      });
      if (!allowed) throw new ForbiddenException('You do not have access to this workspace.');
      const team = await this.prisma.team.findFirst({
         where: { id: teamId, workspaceId, members: { some: { userId } } },
      });
      if (!team) throw new ForbiddenException('You do not have access to this team.');
   }

   private validateDates(startDate?: string, endDate?: string) {
      if (startDate && endDate && new Date(endDate) < new Date(startDate)) {
         throw new BadRequestException('Cycle end date must be after the start date.');
      }
   }
}
