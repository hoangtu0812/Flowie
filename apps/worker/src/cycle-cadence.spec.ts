import assert from 'node:assert/strict';
import test from 'node:test';
import { CycleStatus, PrismaClient } from '@circle/database';
import { runCycleCadence } from './cycle-cadence.js';

function createFakePrisma(existingCycles: Array<Record<string, unknown>> = []) {
   const cycles = [...existingCycles];
   const calls = { audits: 0, creates: 0, activations: 0, completions: 0 };
   const tx = {
      cycle: {
         findFirst: async ({
            where,
         }: {
            where: { teamId: string; startDate: Date; endDate: Date };
         }) =>
            cycles.find(
               (cycle) =>
                  cycle.teamId === where.teamId &&
                  (cycle.startDate as Date).getTime() === where.startDate.getTime() &&
                  (cycle.endDate as Date).getTime() === where.endDate.getTime()
            ),
         create: async ({ data }: { data: Record<string, unknown> }) => {
            calls.creates += 1;
            const cycle = { id: `cycle-${cycles.length + 1}`, createdAt: new Date(), ...data };
            cycles.push(cycle);
            return cycle;
         },
      },
      auditLog: {
         create: async () => {
            calls.audits += 1;
            return {};
         },
      },
   };
   const prisma = {
      team: {
         findMany: async () => [{ id: 'team-1', workspaceId: 'workspace-1', cycleCadenceWeeks: 2 }],
      },
      cycle: {
         findMany: async () => cycles,
         updateMany: async ({
            where,
            data,
         }: {
            where: Record<string, unknown>;
            data: { status: CycleStatus };
         }) => {
            if (data.status === CycleStatus.COMPLETED) {
               calls.completions += 1;
               return { count: 0 };
            }
            if (data.status === CycleStatus.ACTIVE) {
               calls.activations += 1;
               const cycle = cycles.find(({ id }) => id === where.id);
               if (cycle) cycle.status = CycleStatus.ACTIVE;
               return { count: cycle ? 1 : 0 };
            }
            return { count: 0 };
         },
      },
      $transaction: async <T>(operation: (client: typeof tx) => Promise<T>) => operation(tx),
   } as unknown as PrismaClient;
   return { prisma, cycles, calls };
}

test('creates a current and upcoming cycle for a configured team', async () => {
   const { prisma, cycles, calls } = createFakePrisma();

   const result = await runCycleCadence(prisma, new Date('2026-08-24T16:00:00.000Z'));

   assert.deepEqual(result, { teams: 1, created: 2, activated: 0, completed: 0 });
   assert.equal(calls.audits, 2);
   assert.equal(cycles[0].name, 'Cycle 1');
   assert.equal(cycles[0].status, CycleStatus.ACTIVE);
   assert.equal((cycles[0].startDate as Date).toISOString(), '2026-08-24T00:00:00.000Z');
   assert.equal(cycles[1].status, CycleStatus.UPCOMING);
});

test('activates an upcoming cycle and remains idempotent when the horizon is covered', async () => {
   const current = {
      id: 'cycle-1',
      workspaceId: 'workspace-1',
      teamId: 'team-1',
      name: 'Cycle 1',
      status: CycleStatus.UPCOMING,
      startDate: new Date('2026-08-18T00:00:00.000Z'),
      endDate: new Date('2026-08-31T00:00:00.000Z'),
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
   };
   const future = {
      ...current,
      id: 'cycle-2',
      name: 'Cycle 2',
      startDate: new Date('2026-09-01T00:00:00.000Z'),
      endDate: new Date('2026-09-14T00:00:00.000Z'),
   };
   const { prisma, calls } = createFakePrisma([current, future]);

   const first = await runCycleCadence(prisma, new Date('2026-08-24T16:00:00.000Z'));
   const second = await runCycleCadence(prisma, new Date('2026-08-24T16:00:00.000Z'));

   assert.deepEqual(first, { teams: 1, created: 0, activated: 1, completed: 0 });
   assert.deepEqual(second, { teams: 1, created: 0, activated: 0, completed: 0 });
   assert.equal(calls.creates, 0);
});
