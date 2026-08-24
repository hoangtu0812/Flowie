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
import { LinkCycleDocumentDto } from './dto/link-cycle-document.dto';
import { UpdateCycleDto } from './dto/update-cycle.dto';

@Injectable()
export class CyclesService {
   constructor(private readonly prisma: PrismaService) {}

   async list(workspaceId: string, teamId: string, userId: string, status?: CycleStatus) {
      await this.authorize(workspaceId, teamId, userId);
      const cycles = await this.prisma.cycle.findMany({
         where: { workspaceId, teamId, ...(status ? { status } : {}) },
         include: {
            _count: { select: { issueLinks: true } },
            issueLinks: {
               select: {
                  createdAt: true,
                  issue: {
                     select: {
                        updatedAt: true,
                        completedAt: true,
                        status: { select: { category: true } },
                     },
                  },
               },
            },
         },
         orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
      });
      return cycles.map(({ issueLinks, ...cycle }) => ({
         ...cycle,
         progress: buildCycleProgress(
            {
               status: cycle.status,
               startDate: cycle.startDate,
               endDate: cycle.endDate,
               createdAt: cycle.createdAt,
            },
            issueLinks
         ),
      }));
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

   async documents(cycleId: string, workspaceId: string, userId: string) {
      const cycle = await this.findAuthorizedCycle(cycleId, workspaceId, userId);
      const links = await this.prisma.cycleDocument.findMany({
         where: { cycleId: cycle.id, document: { archivedAt: null } },
         include: {
            document: {
               select: { id: true, title: true, updatedAt: true, teamId: true },
            },
         },
         orderBy: { createdAt: 'desc' },
      });
      return links.map((link) => link.document);
   }

   async availableDocuments(cycleId: string, workspaceId: string, userId: string) {
      const cycle = await this.findAuthorizedCycle(cycleId, workspaceId, userId);
      return this.prisma.document.findMany({
         where: {
            workspaceId,
            archivedAt: null,
            OR: [{ teamId: null }, { teamId: cycle.teamId }],
         },
         select: { id: true, title: true, updatedAt: true, teamId: true },
         orderBy: { updatedAt: 'desc' },
      });
   }

   async addDocument(cycleId: string, dto: LinkCycleDocumentDto, userId: string) {
      const cycle = await this.findAuthorizedCycle(cycleId, dto.workspaceId, userId);
      const document = await this.prisma.document.findFirst({
         where: {
            id: dto.documentId,
            workspaceId: dto.workspaceId,
            archivedAt: null,
            OR: [{ teamId: null }, { teamId: cycle.teamId }],
         },
      });
      if (!document) throw new NotFoundException('Document is not available for this cycle.');
      return this.prisma.cycleDocument.upsert({
         where: { cycleId_documentId: { cycleId: cycle.id, documentId: document.id } },
         create: { cycleId: cycle.id, documentId: document.id },
         update: {},
         include: {
            document: { select: { id: true, title: true, updatedAt: true, teamId: true } },
         },
      });
   }

   async removeDocument(cycleId: string, documentId: string, workspaceId: string, userId: string) {
      const cycle = await this.findAuthorizedCycle(cycleId, workspaceId, userId);
      const link = await this.prisma.cycleDocument.findFirst({
         where: { cycleId: cycle.id, documentId },
      });
      if (!link) throw new NotFoundException('Document is not linked to this cycle.');
      await this.prisma.cycleDocument.delete({
         where: { cycleId_documentId: { cycleId: cycle.id, documentId } },
      });
      return { cycleId, documentId, removed: true };
   }

   async removeIssue(cycleId: string, issueId: string, workspaceId: string, userId: string) {
      const cycle = await this.findAuthorizedCycle(cycleId, workspaceId, userId);
      const link = await this.prisma.issueCycle.findFirst({
         where: { cycleId: cycle.id, issueId },
      });
      if (!link) throw new NotFoundException('Issue is not in this cycle.');
      await this.prisma.issueCycle.delete({ where: { issueId_cycleId: { issueId, cycleId } } });
      return { issueId, cycleId, removed: true };
   }

   async remove(cycleId: string, workspaceId: string, userId: string) {
      await this.findAuthorizedCycle(cycleId, workspaceId, userId);
      await this.prisma.cycle.delete({ where: { id: cycleId } });
      return { id: cycleId, deleted: true };
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
         where: { id: teamId, workspaceId, archivedAt: null, members: { some: { userId } } },
      });
      if (!team) throw new ForbiddenException('You do not have access to this team.');
   }

   private validateDates(startDate?: string, endDate?: string) {
      if (startDate && endDate && new Date(endDate) < new Date(startDate)) {
         throw new BadRequestException('Cycle end date must be after the start date.');
      }
   }
}

type ProgressCycle = {
   status: CycleStatus;
   startDate: Date | null;
   endDate: Date | null;
   createdAt: Date;
};

type ProgressIssueLink = {
   createdAt: Date;
   issue: {
      updatedAt: Date;
      completedAt: Date | null;
      status: { category: string };
   };
};

const startOfUtcDay = (value: Date) =>
   new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
const endOfUtcDay = (value: Date) => new Date(startOfUtcDay(value).getTime() + 86_399_999);
const isoDay = (value: Date) => startOfUtcDay(value).toISOString().slice(0, 10);

/**
 * Builds the Circle burn-up model exclusively from persisted cycle links and
 * issue timestamps. Historical status transitions were not stored by older
 * releases, so the started line uses the first persisted update of issues
 * which are currently started; completedAt remains exact.
 */
export function buildCycleProgress(cycle: ProgressCycle, links: ProgressIssueLink[]) {
   const start = startOfUtcDay(cycle.startDate ?? cycle.createdAt);
   const requestedEnd = startOfUtcDay(cycle.endDate ?? new Date());
   const today = startOfUtcDay(new Date());
   const end =
      cycle.status === 'ACTIVE' && requestedEnd.getTime() > today.getTime() ? today : requestedEnd;
   const finalDay = end.getTime() < start.getTime() ? start : end;

   if (cycle.status === 'UPCOMING' || cycle.status === 'CANCELED') {
      return {
         scope: links.length,
         scopeDelta: 0,
         started: 0,
         completed: 0,
         burnup: [],
      };
   }

   const totalDays = Math.max(0, Math.round((finalDay.getTime() - start.getTime()) / 86_400_000));
   const step = Math.max(1, Math.ceil((totalDays + 1) / 120));
   const days: Date[] = [];
   for (let offset = 0; offset <= totalDays; offset += step) {
      days.push(new Date(start.getTime() + offset * 86_400_000));
   }
   if (days.at(-1)?.getTime() !== finalDay.getTime()) days.push(finalDay);

   const burnup = days.map((day) => {
      const cutoff = endOfUtcDay(day);
      const linked = links.filter((link) => link.createdAt.getTime() <= cutoff.getTime());
      const completed = linked.filter(
         (link) => link.issue.completedAt && link.issue.completedAt.getTime() <= cutoff.getTime()
      ).length;
      const currentlyStarted = linked.filter(
         (link) =>
            link.issue.status.category === 'STARTED' &&
            link.issue.updatedAt.getTime() <= cutoff.getTime()
      ).length;
      const elapsed =
         totalDays === 0 ? 1 : (day.getTime() - start.getTime()) / 86_400_000 / totalDays;
      return {
         date: isoDay(day),
         scope: linked.length,
         started: completed + currentlyStarted,
         completed,
         ideal: Math.round(links.length * Math.min(1, Math.max(0, elapsed))),
      };
   });

   const initialScope = burnup[0]?.scope ?? 0;
   const scope = burnup.at(-1)?.scope ?? links.length;
   const completed = links.filter((link) => Boolean(link.issue.completedAt)).length;
   const started = links.filter((link) => link.issue.status.category === 'STARTED').length;
   return {
      scope,
      scopeDelta: initialScope > 0 ? Math.round(((scope - initialScope) / initialScope) * 100) : 0,
      started,
      completed,
      burnup,
   };
}
