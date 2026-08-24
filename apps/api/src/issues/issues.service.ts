import {
   BadRequestException,
   ForbiddenException,
   Injectable,
   NotFoundException,
} from '@nestjs/common';
import { IssueStatusCategory } from '@circle/database';
import { PrismaService } from '../database/prisma.service';
import { CreateIssueDto } from './dto/create-issue.dto';
import { CreateIssueTemplateDto } from './dto/create-issue-template.dto';
import { LinkIssueDto } from './dto/link-issue.dto';
import { issueReactionEmojis, IssueReactionDto } from './dto/issue-reaction.dto';
import { UpdateIssueDto } from './dto/update-issue.dto';
import { UpdateIssueTemplateDto } from './dto/update-issue-template.dto';
import { NotificationsService } from '../notifications/notifications.service';

const issueInclude = {
   team: { select: { id: true, name: true, identifier: true } },
   status: { select: { id: true, name: true, category: true, color: true } },
   project: {
      select: {
         id: true,
         name: true,
         identifier: true,
         status: true,
         priority: true,
         health: true,
         startDate: true,
         targetDate: true,
         lead: { select: { id: true, name: true, avatarUrl: true } },
         team: { select: { id: true, identifier: true } },
      },
   },
   creator: { select: { id: true, name: true, avatarUrl: true } },
   assignee: { select: { id: true, name: true, avatarUrl: true } },
   labelLinks: { include: { label: { select: { id: true, name: true, color: true } } } },
   cycleLinks: { select: { cycleId: true } },
} as const;

const relatedIssueSelect = {
   id: true,
   identifier: true,
   title: true,
   status: { select: { id: true, name: true, color: true, category: true } },
   team: { select: { id: true, name: true, identifier: true } },
} as const;

const subIssueSelect = {
   id: true,
   identifier: true,
   title: true,
   status: { select: { id: true, name: true, color: true, category: true } },
} as const;

@Injectable()
export class IssuesService {
   constructor(
      private readonly prisma: PrismaService,
      private readonly notifications: NotificationsService
   ) {}

   async list(
      workspaceId: string,
      userId: string,
      teamId?: string,
      categories?: IssueStatusCategory[],
      scope?: 'assigned' | 'created' | 'subscribed' | 'activity'
   ) {
      await this.authorize(workspaceId, userId, teamId);
      return this.prisma.issue.findMany({
         where: {
            workspaceId,
            archivedAt: null,
            ...(teamId ? { teamId } : { team: { members: { some: { userId } } } }),
            ...(categories?.length ? { status: { category: { in: categories } } } : {}),
            ...(scope === 'assigned' ? { assigneeId: userId } : {}),
            ...(scope === 'created' ? { creatorId: userId } : {}),
            ...(scope === 'subscribed' ? { subscribers: { some: { userId } } } : {}),
            ...(scope === 'activity' ? { activities: { some: { actorId: userId } } } : {}),
         },
         include: {
            ...issueInclude,
            subscribers: { where: { userId }, select: { userId: true } },
            activities: { where: { actorId: userId }, select: { id: true } },
         },
         orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      });
   }

   /**
    * The issue views need the same workspace-owned choices that are available
    * when an issue is created or edited.  Keeping these in one endpoint avoids
    * the frontend inventing statuses, members, or projects from sample data.
    */
   async options(workspaceId: string, userId: string, teamId?: string) {
      await this.authorize(workspaceId, userId, teamId);

      const memberWhere = teamId
         ? { teamMemberships: { some: { teamId } } }
         : { memberships: { some: { workspaceId, status: 'ACTIVE' as const } } };

      const [statuses, projects, members, labels, cycles, templates] = await Promise.all([
         this.prisma.issueStatus.findMany({
            where: {
               workspaceId,
               ...(teamId ? { OR: [{ teamId: null }, { teamId }] } : {}),
            },
            orderBy: [{ position: 'asc' }, { name: 'asc' }],
         }),
         this.prisma.project.findMany({
            where: {
               workspaceId,
               archivedAt: null,
               ...(teamId ? { OR: [{ teamId: null }, { teamId }] } : {}),
            },
            select: {
               id: true,
               name: true,
               identifier: true,
               status: true,
               priority: true,
               health: true,
               startDate: true,
               targetDate: true,
               lead: { select: { id: true, name: true, avatarUrl: true } },
               team: { select: { id: true, identifier: true } },
            },
            orderBy: { name: 'asc' },
         }),
         this.prisma.user.findMany({
            where: memberWhere,
            select: { id: true, name: true, email: true, avatarUrl: true, createdAt: true },
            orderBy: { name: 'asc' },
         }),
         this.prisma.label.findMany({
            where: { workspaceId },
            select: { id: true, name: true, color: true },
            orderBy: { name: 'asc' },
         }),
         this.prisma.cycle.findMany({
            where: {
               workspaceId,
               ...(teamId ? { teamId } : { team: { members: { some: { userId } } } }),
            },
            select: { id: true, name: true, status: true, startDate: true, endDate: true },
            orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
         }),
         this.prisma.issueTemplate.findMany({
            where: { workspaceId },
            include: { createdBy: { select: { id: true, name: true, avatarUrl: true } } },
            orderBy: { name: 'asc' },
         }),
      ]);

      return { statuses, projects, members, labels, cycles, templates };
   }

   async templates(workspaceId: string, userId: string) {
      await this.authorize(workspaceId, userId);
      return this.prisma.issueTemplate.findMany({
         where: { workspaceId },
         include: { createdBy: { select: { id: true, name: true, avatarUrl: true } } },
         orderBy: { name: 'asc' },
      });
   }

   async createTemplate(dto: CreateIssueTemplateDto, userId: string) {
      await this.authorizeManager(dto.workspaceId, userId);
      await this.assertTemplateReferences(dto.workspaceId, dto);
      return this.prisma.issueTemplate.create({
         data: {
            ...dto,
            name: dto.name.trim(),
            title: dto.title.trim(),
            labelIds: [...new Set(dto.labelIds ?? [])],
            createdById: userId,
         },
         include: { createdBy: { select: { id: true, name: true, avatarUrl: true } } },
      });
   }

   async updateTemplate(
      templateId: string,
      workspaceId: string,
      dto: UpdateIssueTemplateDto,
      userId: string
   ) {
      await this.authorizeManager(workspaceId, userId);
      const template = await this.prisma.issueTemplate.findFirst({
         where: { id: templateId, workspaceId },
      });
      if (!template) throw new NotFoundException('Issue template not found.');
      await this.assertTemplateReferences(workspaceId, dto);
      return this.prisma.issueTemplate.update({
         where: { id: templateId },
         data: {
            ...dto,
            ...(dto.name ? { name: dto.name.trim() } : {}),
            ...(dto.title ? { title: dto.title.trim() } : {}),
            ...(dto.labelIds ? { labelIds: [...new Set(dto.labelIds)] } : {}),
         },
         include: { createdBy: { select: { id: true, name: true, avatarUrl: true } } },
      });
   }

   async removeTemplate(templateId: string, workspaceId: string, userId: string) {
      await this.authorizeManager(workspaceId, userId);
      const template = await this.prisma.issueTemplate.findFirst({
         where: { id: templateId, workspaceId },
      });
      if (!template) throw new NotFoundException('Issue template not found.');
      await this.prisma.issueTemplate.delete({ where: { id: templateId } });
      return { id: templateId, deleted: true };
   }

   async create(dto: CreateIssueDto, userId: string) {
      await this.authorize(dto.workspaceId, userId, dto.teamId);
      const issue = await this.prisma.$transaction(async (tx) => {
         const { labelIds, parentIssueId, ...issueData } = dto;
         const subscriberIds = [...new Set([userId, ...(dto.assigneeId ? [dto.assigneeId] : [])])];
         const team = await tx.team.update({
            where: { id: dto.teamId },
            data: { issueSequence: { increment: 1 } },
            select: { identifier: true, issueSequence: true },
         });
         const status = dto.statusId
            ? await tx.issueStatus.findFirst({
                 where: { id: dto.statusId, workspaceId: dto.workspaceId },
              })
            : await tx.issueStatus.findFirst({
                 where: { workspaceId: dto.workspaceId, category: 'UNSTARTED' },
                 orderBy: { position: 'asc' },
              });
         if (!status) throw new NotFoundException('A valid issue status is required.');
         if (dto.projectId) {
            const project = await tx.project.findFirst({
               where: { id: dto.projectId, workspaceId: dto.workspaceId, archivedAt: null },
            });
            if (!project) throw new NotFoundException('Project not found.');
         }
         if (parentIssueId) {
            const parent = await tx.issue.findFirst({
               where: {
                  id: parentIssueId,
                  workspaceId: dto.workspaceId,
                  teamId: dto.teamId,
                  archivedAt: null,
               },
            });
            if (!parent) throw new NotFoundException('Parent issue was not found for this team.');
         }
         if (dto.assigneeId) {
            const assignee = await tx.workspaceMember.findFirst({
               where: { workspaceId: dto.workspaceId, userId: dto.assigneeId, status: 'ACTIVE' },
            });
            if (!assignee) throw new NotFoundException('Assignee is not a workspace member.');
         }
         if (labelIds?.length) {
            const labelCount = await tx.label.count({
               where: { workspaceId: dto.workspaceId, id: { in: labelIds } },
            });
            if (labelCount !== new Set(labelIds).size) {
               throw new NotFoundException('One or more labels were not found.');
            }
         }
         const issue = await tx.issue.create({
            data: {
               ...issueData,
               statusId: status.id,
               identifier: `${team.identifier}-${team.issueSequence}`,
               number: team.issueSequence,
               creatorId: userId,
               ...(parentIssueId ? { parentIssueId } : {}),
               ...(labelIds?.length
                  ? { labelLinks: { create: labelIds.map((labelId) => ({ labelId })) } }
                  : {}),
               subscribers: {
                  create: subscriberIds.map((subscriberId) => ({ userId: subscriberId })),
               },
            },
            include: issueInclude,
         });
         await tx.activity.create({
            data: {
               workspaceId: dto.workspaceId,
               issueId: issue.id,
               actorId: userId,
               type: 'issue.created',
               data: { title: issue.title, identifier: issue.identifier },
            },
         });
         if (parentIssueId) {
            await tx.activity.create({
               data: {
                  workspaceId: dto.workspaceId,
                  issueId: parentIssueId,
                  actorId: userId,
                  type: 'issue.subissue_created',
                  data: { issueId: issue.id, identifier: issue.identifier, title: issue.title },
               },
            });
         }
         return issue;
      });
      void this.notifications.notifyWorkspace(
         dto.workspaceId,
         userId,
         'issue.created',
         'issue',
         issue.id,
         { title: issue.title, identifier: issue.identifier },
         `🆕 Issue ${issue.identifier}: ${issue.title}`
      );
      return issue;
   }

   async get(issueId: string, workspaceId: string, userId: string) {
      const issue = await this.prisma.issue.findFirst({
         where: { id: issueId, workspaceId, archivedAt: null },
         include: {
            ...issueInclude,
            _count: { select: { comments: true } },
         },
      });
      if (!issue) throw new NotFoundException('Issue not found.');
      await this.authorize(workspaceId, userId, issue.teamId);
      return issue;
   }

   async subIssues(issueId: string, workspaceId: string, userId: string) {
      const parent = await this.get(issueId, workspaceId, userId);
      return this.prisma.issue.findMany({
         where: { parentIssueId: parent.id, workspaceId, teamId: parent.teamId, archivedAt: null },
         select: subIssueSelect,
         orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      });
   }

   async reactions(issueId: string, workspaceId: string, userId: string) {
      await this.get(issueId, workspaceId, userId);
      const [groups, current] = await Promise.all([
         this.prisma.issueReaction.groupBy({
            by: ['emoji'],
            where: { issueId },
            _count: { emoji: true },
            orderBy: { _count: { emoji: 'desc' } },
         }),
         this.prisma.issueReaction.findMany({
            where: { issueId, userId },
            select: { emoji: true },
         }),
      ]);
      const currentEmojis = new Set(current.map((reaction) => reaction.emoji));
      return groups.map((group) => ({
         emoji: group.emoji,
         count: group._count.emoji,
         reacted: currentEmojis.has(group.emoji),
      }));
   }

   async addReaction(issueId: string, dto: IssueReactionDto, userId: string) {
      await this.get(issueId, dto.workspaceId, userId);
      return this.prisma.issueReaction.upsert({
         where: { issueId_userId_emoji: { issueId, userId, emoji: dto.emoji } },
         create: { issueId, userId, emoji: dto.emoji },
         update: {},
      });
   }

   async removeReaction(issueId: string, emoji: string, workspaceId: string, userId: string) {
      await this.get(issueId, workspaceId, userId);
      if (!issueReactionEmojis.includes(emoji as (typeof issueReactionEmojis)[number])) {
         throw new BadRequestException('Unsupported reaction.');
      }
      await this.prisma.issueReaction.deleteMany({ where: { issueId, userId, emoji } });
      return { issueId, emoji, removed: true };
   }

   async relations(issueId: string, workspaceId: string, userId: string) {
      const issue = await this.get(issueId, workspaceId, userId);
      const links = await this.prisma.issueRelation.findMany({
         where: {
            workspaceId,
            OR: [
               {
                  issueId: issue.id,
                  relatedIssue: {
                     archivedAt: null,
                     team: { members: { some: { userId } } },
                  },
               },
               {
                  relatedIssueId: issue.id,
                  issue: {
                     archivedAt: null,
                     team: { members: { some: { userId } } },
                  },
               },
            ],
         },
         select: {
            issueId: true,
            relatedIssueId: true,
            issue: { select: relatedIssueSelect },
            relatedIssue: { select: relatedIssueSelect },
         },
         orderBy: { createdAt: 'desc' },
      });
      return links.map((link) => (link.issueId === issue.id ? link.relatedIssue : link.issue));
   }

   async addRelation(issueId: string, dto: LinkIssueDto, userId: string) {
      const issue = await this.get(issueId, dto.workspaceId, userId);
      const related = await this.get(dto.relatedIssueId, dto.workspaceId, userId);
      if (issue.id === related.id)
         throw new BadRequestException('An issue cannot be related to itself.');
      const [firstIssueId, secondIssueId] = [issue.id, related.id].sort();
      const existing = await this.prisma.issueRelation.findUnique({
         where: {
            issueId_relatedIssueId: { issueId: firstIssueId, relatedIssueId: secondIssueId },
         },
         include: {
            issue: { select: relatedIssueSelect },
            relatedIssue: { select: relatedIssueSelect },
         },
      });
      if (existing) return existing;

      return this.prisma.$transaction(async (tx) => {
         const relation = await tx.issueRelation.create({
            data: {
               workspaceId: dto.workspaceId,
               issueId: firstIssueId,
               relatedIssueId: secondIssueId,
               createdById: userId,
            },
            include: {
               issue: { select: relatedIssueSelect },
               relatedIssue: { select: relatedIssueSelect },
            },
         });
         await tx.activity.createMany({
            data: [
               {
                  workspaceId: dto.workspaceId,
                  issueId: issue.id,
                  actorId: userId,
                  type: 'issue.related',
                  data: { relatedIssueId: related.id, relatedIdentifier: related.identifier },
               },
               {
                  workspaceId: dto.workspaceId,
                  issueId: related.id,
                  actorId: userId,
                  type: 'issue.related',
                  data: { relatedIssueId: issue.id, relatedIdentifier: issue.identifier },
               },
            ],
         });
         return relation;
      });
   }

   async removeRelation(
      issueId: string,
      relatedIssueId: string,
      workspaceId: string,
      userId: string
   ) {
      const issue = await this.get(issueId, workspaceId, userId);
      const related = await this.get(relatedIssueId, workspaceId, userId);
      const [firstIssueId, secondIssueId] = [issue.id, related.id].sort();
      const relation = await this.prisma.issueRelation.findUnique({
         where: {
            issueId_relatedIssueId: { issueId: firstIssueId, relatedIssueId: secondIssueId },
         },
      });
      if (!relation) throw new NotFoundException('Issues are not linked.');
      await this.prisma.$transaction([
         this.prisma.issueRelation.delete({
            where: {
               issueId_relatedIssueId: { issueId: firstIssueId, relatedIssueId: secondIssueId },
            },
         }),
         this.prisma.activity.createMany({
            data: [
               {
                  workspaceId,
                  issueId: issue.id,
                  actorId: userId,
                  type: 'issue.unrelated',
                  data: { relatedIssueId: related.id, relatedIdentifier: related.identifier },
               },
               {
                  workspaceId,
                  issueId: related.id,
                  actorId: userId,
                  type: 'issue.unrelated',
                  data: { relatedIssueId: issue.id, relatedIdentifier: issue.identifier },
               },
            ],
         }),
      ]);
      return { issueId: issue.id, relatedIssueId: related.id, removed: true };
   }

   async update(issueId: string, workspaceId: string, dto: UpdateIssueDto, userId: string) {
      const issue = await this.get(issueId, workspaceId, userId);
      const { labelIds, ...issueData } = dto;
      const status = dto.statusId
         ? await this.prisma.issueStatus.findFirst({ where: { id: dto.statusId, workspaceId } })
         : undefined;
      if (dto.statusId && !status) throw new NotFoundException('Issue status not found.');
      if (dto.projectId) {
         const project = await this.prisma.project.findFirst({
            where: { id: dto.projectId, workspaceId, archivedAt: null },
         });
         if (!project || (project.teamId && project.teamId !== issue.teamId)) {
            throw new NotFoundException('Project not found for this team.');
         }
      }
      if (dto.assigneeId) {
         const assignee = await this.prisma.workspaceMember.findFirst({
            where: { workspaceId, userId: dto.assigneeId, status: 'ACTIVE' },
         });
         if (!assignee) throw new NotFoundException('Assignee is not a workspace member.');
      }
      if (labelIds) {
         const labelCount = await this.prisma.label.count({
            where: { workspaceId, id: { in: labelIds } },
         });
         if (labelCount !== new Set(labelIds).size) {
            throw new NotFoundException('One or more labels were not found.');
         }
      }
      return this.prisma.$transaction(async (tx) => {
         const updated = await tx.issue.update({
            where: { id: issueId },
            data: {
               ...issueData,
               ...(labelIds
                  ? {
                       labelLinks: {
                          deleteMany: {},
                          create: labelIds.map((labelId) => ({ labelId })),
                       },
                    }
                  : {}),
               ...(status
                  ? {
                       completedAt: status.category === 'COMPLETED' ? new Date() : null,
                       canceledAt: status.category === 'CANCELED' ? new Date() : null,
                    }
                  : {}),
            },
            include: issueInclude,
         });
         if (dto.assigneeId) {
            await tx.issueSubscription.upsert({
               where: { issueId_userId: { issueId, userId: dto.assigneeId } },
               update: {},
               create: { issueId, userId: dto.assigneeId },
            });
         }
         await tx.activity.create({
            data: {
               workspaceId,
               issueId,
               actorId: userId,
               type: 'issue.updated',
               data: { fields: Object.keys(dto) },
            },
         });
         return updated;
      });
   }

   async subscribe(issueId: string, workspaceId: string, userId: string) {
      await this.get(issueId, workspaceId, userId);
      return this.prisma.issueSubscription.upsert({
         where: { issueId_userId: { issueId, userId } },
         update: {},
         create: { issueId, userId },
      });
   }

   async unsubscribe(issueId: string, workspaceId: string, userId: string) {
      await this.get(issueId, workspaceId, userId);
      await this.prisma.issueSubscription.deleteMany({ where: { issueId, userId } });
   }

   async archive(issueId: string, workspaceId: string, userId: string) {
      await this.get(issueId, workspaceId, userId);
      return this.prisma.$transaction(async (tx) => {
         const archivedAt = new Date();
         const archived = await tx.issue.update({
            where: { id: issueId },
            data: { archivedAt },
            include: issueInclude,
         });
         await tx.activity.create({
            data: { workspaceId, issueId, actorId: userId, type: 'issue.archived', data: {} },
         });
         return archived;
      });
   }

   private async authorize(workspaceId: string, userId: string, teamId?: string) {
      const membership = await this.prisma.workspaceMember.findFirst({
         where: { workspaceId, userId, status: 'ACTIVE' },
      });
      if (!membership) throw new ForbiddenException('You do not have access to this workspace.');
      if (!teamId) return;
      const team = await this.prisma.team.findFirst({
         where: { id: teamId, workspaceId, archivedAt: null, members: { some: { userId } } },
      });
      if (!team) throw new ForbiddenException('You do not have access to this team.');
   }

   private async authorizeManager(workspaceId: string, userId: string) {
      const membership = await this.prisma.workspaceMember.findFirst({
         where: { workspaceId, userId, status: 'ACTIVE', role: { in: ['OWNER', 'ADMIN'] } },
      });
      if (!membership) throw new ForbiddenException('Workspace administrator access is required.');
   }

   private async assertTemplateReferences(
      workspaceId: string,
      dto: Pick<
         CreateIssueTemplateDto | UpdateIssueTemplateDto,
         'statusId' | 'projectId' | 'assigneeId' | 'labelIds'
      >
   ) {
      const [status, project, assignee, labelCount] = await Promise.all([
         dto.statusId
            ? this.prisma.issueStatus.findFirst({ where: { id: dto.statusId, workspaceId } })
            : undefined,
         dto.projectId
            ? this.prisma.project.findFirst({
                 where: { id: dto.projectId, workspaceId, archivedAt: null },
              })
            : undefined,
         dto.assigneeId
            ? this.prisma.workspaceMember.findFirst({
                 where: { workspaceId, userId: dto.assigneeId, status: 'ACTIVE' },
              })
            : undefined,
         dto.labelIds?.length
            ? this.prisma.label.count({
                 where: { workspaceId, id: { in: [...new Set(dto.labelIds)] } },
              })
            : 0,
      ]);
      if (dto.statusId && !status) throw new NotFoundException('Issue status not found.');
      if (dto.projectId && !project) throw new NotFoundException('Project not found.');
      if (dto.assigneeId && !assignee)
         throw new NotFoundException('Assignee is not a workspace member.');
      if (dto.labelIds && labelCount !== new Set(dto.labelIds).size) {
         throw new NotFoundException('One or more labels were not found.');
      }
   }
}
