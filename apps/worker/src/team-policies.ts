import { IssuePriority, IssueStatusCategory, Prisma, PrismaClient } from '@circle/database';

const OPEN_CATEGORIES: IssueStatusCategory[] = [
   IssueStatusCategory.TRIAGE,
   IssueStatusCategory.BACKLOG,
   IssueStatusCategory.UNSTARTED,
   IssueStatusCategory.STARTED,
];
const CLOSED_CATEGORIES: IssueStatusCategory[] = [
   IssueStatusCategory.COMPLETED,
   IssueStatusCategory.CANCELED,
];
const DEFAULT_BATCH_SIZE = 200;

type PolicyTeam = {
   id: string;
   workspaceId: string;
   autoCloseDays: number | null;
   autoArchiveDays: number | null;
};

type PolicyResult = {
   closed: number;
   archived: number;
};

export type TeamPolicyRunResult = PolicyResult & {
   teams: number;
};

export function policyCutoff(now: Date, days: number): Date {
   return new Date(now.getTime() - days * 24 * 60 * 60 * 1_000);
}

function openIssueEligibility(
   teamId: string,
   cutoff: Date,
   now: Date,
   closedProjectStatuses: string[]
): Prisma.IssueWhereInput {
   return {
      teamId,
      archivedAt: null,
      updatedAt: { lte: cutoff },
      status: { category: { in: OPEN_CATEGORIES } },
      OR: [{ dueDate: null }, { dueDate: { lte: now } }],
      cycleLinks: { none: { cycle: { status: 'ACTIVE' } } },
      comments: {
         none: {
            deletedAt: null,
            OR: [{ createdAt: { gt: cutoff } }, { updatedAt: { gt: cutoff } }],
         },
      },
      activities: { none: { createdAt: { gt: cutoff } } },
      subIssues: {
         none: {
            archivedAt: null,
            status: { category: { notIn: CLOSED_CATEGORIES } },
         },
      },
      AND: [
         {
            OR: [
               { projectId: null },
               { project: { archivedAt: { not: null } } },
               {
                  project: {
                     archivedAt: null,
                     status: { in: closedProjectStatuses },
                  },
               },
            ],
         },
      ],
   };
}

function closedIssueEligibility(
   teamId: string,
   cutoff: Date,
   closedProjectStatuses: string[]
): Prisma.IssueWhereInput {
   return {
      teamId,
      archivedAt: null,
      updatedAt: { lte: cutoff },
      status: { category: { in: CLOSED_CATEGORIES } },
      comments: {
         none: {
            deletedAt: null,
            OR: [{ createdAt: { gt: cutoff } }, { updatedAt: { gt: cutoff } }],
         },
      },
      activities: { none: { createdAt: { gt: cutoff } } },
      AND: [
         {
            OR: [
               { completedAt: { lte: cutoff } },
               { canceledAt: { lte: cutoff } },
               { completedAt: null, canceledAt: null },
            ],
         },
         {
            OR: [
               { parentIssueId: null },
               { parentIssue: { archivedAt: { not: null } } },
               {
                  parentIssue: {
                     archivedAt: null,
                     updatedAt: { lte: cutoff },
                     status: { category: { in: CLOSED_CATEGORIES } },
                  },
               },
            ],
         },
         {
            OR: [
               { projectId: null },
               { project: { archivedAt: { not: null } } },
               {
                  project: {
                     archivedAt: null,
                     updatedAt: { lte: cutoff },
                     status: { in: closedProjectStatuses },
                  },
               },
            ],
         },
      ],
      subIssues: {
         none: {
            archivedAt: null,
            OR: [
               { updatedAt: { gt: cutoff } },
               { status: { category: { notIn: CLOSED_CATEGORIES } } },
            ],
         },
      },
      cycleLinks: {
         none: {
            cycle: {
               OR: [
                  { status: { in: ['ACTIVE', 'UPCOMING'] } },
                  {
                     status: { in: ['COMPLETED', 'CANCELED'] },
                     updatedAt: { gt: cutoff },
                  },
               ],
            },
         },
      },
   };
}

async function closedProjectStatusNames(prisma: PrismaClient, workspaceId: string) {
   const statuses = await prisma.projectStatus.findMany({
      where: { workspaceId, category: { in: ['completed', 'canceled'] } },
      select: { name: true },
   });
   return [
      ...new Set(['completed', 'canceled', 'cancelled', ...statuses.map((status) => status.name)]),
   ];
}

async function hasActiveSla(
   prisma: Prisma.TransactionClient,
   issue: { workspaceId: string; teamId: string; priority: IssuePriority }
) {
   return (
      (await prisma.slaPolicy.count({
         where: {
            workspaceId: issue.workspaceId,
            archivedAt: null,
            enabled: true,
            OR: [{ teamId: null }, { teamId: issue.teamId }],
            AND: [{ OR: [{ priority: null }, { priority: issue.priority }] }],
         },
      })) > 0
   );
}

async function applyAutoClose(
   prisma: PrismaClient,
   team: PolicyTeam,
   now: Date,
   closedProjectStatuses: string[],
   batchSize: number
) {
   if (!team.autoCloseDays) return 0;
   const cutoff = policyCutoff(now, team.autoCloseDays);
   const eligibility = openIssueEligibility(team.id, cutoff, now, closedProjectStatuses);
   const canceledStatus =
      (await prisma.issueStatus.findFirst({
         where: {
            workspaceId: team.workspaceId,
            teamId: team.id,
            category: IssueStatusCategory.CANCELED,
         },
         orderBy: { position: 'asc' },
         select: { id: true },
      })) ??
      (await prisma.issueStatus.findFirst({
         where: {
            workspaceId: team.workspaceId,
            teamId: null,
            category: IssueStatusCategory.CANCELED,
         },
         orderBy: { position: 'asc' },
         select: { id: true },
      }));
   if (!canceledStatus) {
      console.warn(`Skipping auto-close for team ${team.id}: no canceled status is configured.`);
      return 0;
   }

   const candidates = await prisma.issue.findMany({
      where: eligibility,
      orderBy: { updatedAt: 'asc' },
      take: batchSize,
      select: {
         id: true,
         workspaceId: true,
         teamId: true,
         statusId: true,
         identifier: true,
         title: true,
         priority: true,
         subscribers: { select: { userId: true } },
      },
   });

   let closed = 0;
   for (const issue of candidates) {
      const changed = await prisma.$transaction(async (tx) => {
         if (await hasActiveSla(tx, issue)) return false;
         const claim = await tx.issue.updateMany({
            where: { id: issue.id, ...eligibility },
            data: {
               statusId: canceledStatus.id,
               completedAt: null,
               canceledAt: now,
               resolution: null,
               duplicateOfId: null,
            },
         });
         if (!claim.count) return false;
         await tx.activity.create({
            data: {
               workspaceId: issue.workspaceId,
               issueId: issue.id,
               actorId: null,
               type: 'issue.auto_closed',
               data: {
                  previousStatusId: issue.statusId,
                  statusId: canceledStatus.id,
                  inactivityDays: team.autoCloseDays,
               },
            },
         });
         const recipientIds = [...new Set(issue.subscribers.map(({ userId }) => userId))];
         if (recipientIds.length) {
            const enabledRecipients = await tx.notificationPreference.findMany({
               where: {
                  workspaceId: issue.workspaceId,
                  userId: { in: recipientIds },
                  issueCompleted: true,
               },
               select: { userId: true },
            });
            if (enabledRecipients.length) {
               await tx.notification.createMany({
                  data: enabledRecipients.map(({ userId }) => ({
                     workspaceId: issue.workspaceId,
                     userId,
                     type: 'issue.auto_closed',
                     entityType: 'issue',
                     entityId: issue.id,
                     data: {
                        identifier: issue.identifier,
                        title: issue.title,
                        inactivityDays: team.autoCloseDays,
                     },
                  })),
               });
            }
         }
         return true;
      });
      if (changed) closed += 1;
   }
   return closed;
}

async function applyAutoArchive(
   prisma: PrismaClient,
   team: PolicyTeam,
   now: Date,
   closedProjectStatuses: string[],
   batchSize: number
) {
   if (!team.autoArchiveDays) return 0;
   const cutoff = policyCutoff(now, team.autoArchiveDays);
   const eligibility = closedIssueEligibility(team.id, cutoff, closedProjectStatuses);
   const candidates = await prisma.issue.findMany({
      where: eligibility,
      orderBy: { updatedAt: 'asc' },
      take: batchSize,
      select: {
         id: true,
         workspaceId: true,
         creatorId: true,
         identifier: true,
         title: true,
      },
   });

   let archived = 0;
   for (const issue of candidates) {
      const changed = await prisma.$transaction(async (tx) => {
         const claim = await tx.issue.updateMany({
            where: { id: issue.id, ...eligibility },
            data: { archivedAt: now },
         });
         if (!claim.count) return false;
         await tx.activity.create({
            data: {
               workspaceId: issue.workspaceId,
               issueId: issue.id,
               actorId: null,
               type: 'issue.auto_archived',
               data: { inactivityDays: team.autoArchiveDays },
            },
         });
         await tx.notification.create({
            data: {
               workspaceId: issue.workspaceId,
               userId: issue.creatorId,
               type: 'issue.auto_archived',
               entityType: 'issue',
               entityId: issue.id,
               data: {
                  identifier: issue.identifier,
                  title: issue.title,
                  inactivityDays: team.autoArchiveDays,
               },
            },
         });
         return true;
      });
      if (changed) archived += 1;
   }
   return archived;
}

export async function runTeamPolicies(
   prisma: PrismaClient,
   now = new Date(),
   batchSize = DEFAULT_BATCH_SIZE
): Promise<TeamPolicyRunResult> {
   const teams = await prisma.team.findMany({
      where: {
         archivedAt: null,
         OR: [{ autoCloseDays: { not: null } }, { autoArchiveDays: { not: null } }],
      },
      select: {
         id: true,
         workspaceId: true,
         autoCloseDays: true,
         autoArchiveDays: true,
      },
   });
   const result: PolicyResult = { closed: 0, archived: 0 };
   for (const team of teams) {
      const projectStatuses = await closedProjectStatusNames(prisma, team.workspaceId);
      result.closed += await applyAutoClose(prisma, team, now, projectStatuses, batchSize);
      result.archived += await applyAutoArchive(prisma, team, now, projectStatuses, batchSize);
   }
   return { teams: teams.length, ...result };
}
