import assert from 'node:assert/strict';
import test from 'node:test';
import { IssuePriority, PrismaClient } from '@circle/database';
import { policyCutoff, runTeamPolicies } from './team-policies.js';

type FakeOptions = {
   autoCloseDays?: number | null;
   autoArchiveDays?: number | null;
   activeSla?: boolean;
   claim?: () => number;
   issueCompletedPreference?: boolean;
};

function createFakePrisma(options: FakeOptions = {}) {
   const calls = {
      issueWhere: [] as unknown[],
      updates: 0,
      activities: 0,
      notifications: 0,
      notificationWorkspaceIds: [] as string[],
   };
   const autoCloseDays = options.autoCloseDays ?? null;
   const autoArchiveDays = options.autoArchiveDays ?? null;
   const issue = {
      id: 'issue-1',
      workspaceId: 'workspace-1',
      teamId: 'team-1',
      statusId: 'status-open',
      creatorId: 'creator-1',
      identifier: 'TEAM-1',
      title: 'Stale issue',
      priority: IssuePriority.MEDIUM,
      subscribers: [{ userId: 'subscriber-1' }, { userId: 'subscriber-1' }],
   };
   const tx = {
      slaPolicy: {
         count: async () => (options.activeSla ? 1 : 0),
      },
      issue: {
         updateMany: async () => {
            calls.updates += 1;
            return { count: options.claim?.() ?? 1 };
         },
      },
      activity: {
         create: async () => {
            calls.activities += 1;
            return {};
         },
      },
      notification: {
         create: async ({ data }: { data: { workspaceId: string } }) => {
            calls.notifications += 1;
            calls.notificationWorkspaceIds.push(data.workspaceId);
            return {};
         },
         createMany: async ({ data }: { data: Array<{ workspaceId: string }> }) => {
            calls.notifications += data.length;
            calls.notificationWorkspaceIds.push(...data.map(({ workspaceId }) => workspaceId));
            return { count: data.length };
         },
      },
      notificationPreference: {
         findMany: async ({ where }: { where: { userId: { in: string[] } } }) =>
            options.issueCompletedPreference === false
               ? []
               : where.userId.in.map((userId) => ({ userId })),
      },
   };
   const prisma = {
      team: {
         findMany: async () => [
            {
               id: 'team-1',
               workspaceId: 'workspace-1',
               autoCloseDays,
               autoArchiveDays,
            },
         ],
      },
      projectStatus: { findMany: async () => [] },
      issueStatus: { findFirst: async () => ({ id: 'status-canceled' }) },
      issue: {
         findMany: async (query: { where: unknown }) => {
            calls.issueWhere.push(query.where);
            return [issue];
         },
      },
      $transaction: async <T>(callback: (client: typeof tx) => Promise<T>) => callback(tx),
   } as unknown as PrismaClient;
   return { prisma, calls };
}

test('policyCutoff uses exact whole-day intervals', () => {
   const now = new Date('2026-08-24T12:30:00.000Z');
   assert.equal(policyCutoff(now, 30).toISOString(), '2026-07-25T12:30:00.000Z');
});

test('auto-close claims a stale issue once and deduplicates subscriber notifications', async () => {
   let available = true;
   const { prisma, calls } = createFakePrisma({
      autoCloseDays: 30,
      claim: () => {
         if (!available) return 0;
         available = false;
         return 1;
      },
   });
   const now = new Date('2026-08-24T12:00:00.000Z');

   assert.deepEqual(await runTeamPolicies(prisma, now), { teams: 1, closed: 1, archived: 0 });
   assert.deepEqual(await runTeamPolicies(prisma, now), { teams: 1, closed: 0, archived: 0 });
   assert.equal(calls.activities, 1);
   assert.equal(calls.notifications, 1);
   assert.deepEqual(calls.notificationWorkspaceIds, ['workspace-1']);
   assert.equal(calls.updates, 2);
   assert.match(JSON.stringify(calls.issueWhere[0]), /ACTIVE/);
   assert.match(JSON.stringify(calls.issueWhere[0]), /comments/);
   assert.match(JSON.stringify(calls.issueWhere[0]), /activities/);
});

test('auto-close leaves an issue with an active SLA unchanged', async () => {
   const { prisma, calls } = createFakePrisma({ autoCloseDays: 30, activeSla: true });
   const result = await runTeamPolicies(prisma, new Date('2026-08-24T12:00:00.000Z'));

   assert.deepEqual(result, { teams: 1, closed: 0, archived: 0 });
   assert.equal(calls.updates, 0);
   assert.equal(calls.activities, 0);
   assert.equal(calls.notifications, 0);
});

test('auto-close does not create an inbox item when completion notifications are disabled', async () => {
   const { prisma, calls } = createFakePrisma({
      autoCloseDays: 30,
      issueCompletedPreference: false,
   });
   const result = await runTeamPolicies(prisma, new Date('2026-08-24T12:00:00.000Z'));

   assert.deepEqual(result, { teams: 1, closed: 1, archived: 0 });
   assert.equal(calls.notifications, 0);
});

test('auto-archive claims a closed issue and notifies its creator', async () => {
   const { prisma, calls } = createFakePrisma({ autoArchiveDays: 90 });
   const result = await runTeamPolicies(prisma, new Date('2026-08-24T12:00:00.000Z'));

   assert.deepEqual(result, { teams: 1, closed: 0, archived: 1 });
   assert.equal(calls.updates, 1);
   assert.equal(calls.activities, 1);
   assert.equal(calls.notifications, 1);
   assert.deepEqual(calls.notificationWorkspaceIds, ['workspace-1']);
   assert.match(JSON.stringify(calls.issueWhere[0]), /COMPLETED/);
   assert.match(JSON.stringify(calls.issueWhere[0]), /CANCELED/);
});
