import { CycleStatus, PrismaClient } from '@circle/database';

type CadenceTeam = {
   id: string;
   workspaceId: string;
   cycleCadenceWeeks: number;
};

type DatedCycle = {
   id: string;
   name: string;
   status: CycleStatus;
   startDate: Date | null;
   endDate: Date | null;
};

export type CycleCadenceRunResult = {
   teams: number;
   created: number;
   activated: number;
   completed: number;
};

const startOfUtcDay = (value: Date) =>
   new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));

const addUtcDays = (value: Date, days: number) =>
   new Date(value.getTime() + days * 24 * 60 * 60 * 1_000);

const isDated = (cycle: DatedCycle): cycle is DatedCycle & { startDate: Date; endDate: Date } =>
   cycle.startDate instanceof Date && cycle.endDate instanceof Date;

function nextCycleName(names: Set<string>) {
   let number = 1;
   while (names.has(`Cycle ${number}`)) number += 1;
   const name = `Cycle ${number}`;
   names.add(name);
   return name;
}

async function createGeneratedCycle(
   prisma: PrismaClient,
   team: CadenceTeam,
   names: Set<string>,
   startDate: Date,
   endDate: Date,
   status: CycleStatus
) {
   return prisma.$transaction(async (tx) => {
      const existing = await tx.cycle.findFirst({
         where: { teamId: team.id, startDate, endDate },
      });
      if (existing) return { cycle: existing, created: false };
      const cycle = await tx.cycle.create({
         data: {
            workspaceId: team.workspaceId,
            teamId: team.id,
            name: nextCycleName(names),
            status,
            startDate,
            endDate,
         },
      });
      await tx.auditLog.create({
         data: {
            workspaceId: team.workspaceId,
            actorId: null,
            action: 'cycle.auto_generated',
            entityType: 'cycle',
            entityId: cycle.id,
            metadata: {
               teamId: team.id,
               cadenceWeeks: team.cycleCadenceWeeks,
               startDate: startDate.toISOString(),
               endDate: endDate.toISOString(),
            },
         },
      });
      return { cycle, created: true };
   });
}

async function applyTeamCadence(prisma: PrismaClient, team: CadenceTeam, today: Date) {
   const durationDays = team.cycleCadenceWeeks * 7;
   const cycles = (await prisma.cycle.findMany({
      where: { teamId: team.id },
      select: { id: true, name: true, status: true, startDate: true, endDate: true },
      orderBy: [{ startDate: 'asc' }, { createdAt: 'asc' }],
   })) as DatedCycle[];
   const names = new Set(cycles.map(({ name }) => name));
   const datedCycles = cycles.filter(isDated);

   const completed = await prisma.cycle.updateMany({
      where: {
         teamId: team.id,
         status: { in: [CycleStatus.ACTIVE, CycleStatus.UPCOMING] },
         endDate: { lt: today },
      },
      data: { status: CycleStatus.COMPLETED },
   });

   const covering = datedCycles
      .filter(({ startDate, endDate }) => startDate <= today && endDate >= today)
      .sort((left, right) => right.startDate.getTime() - left.startDate.getTime())[0];
   let activated = 0;
   if (covering && covering.status === CycleStatus.UPCOMING) {
      const result = await prisma.cycle.updateMany({
         where: { id: covering.id, status: CycleStatus.UPCOMING },
         data: { status: CycleStatus.ACTIVE },
      });
      activated += result.count;
   }

   let created = 0;
   let currentEnd = covering?.endDate;
   if (!covering) {
      const nextFuture = datedCycles.find(({ startDate }) => startDate > today);
      const plannedEnd = addUtcDays(today, durationDays - 1);
      const endDate = nextFuture
         ? new Date(Math.min(plannedEnd.getTime(), addUtcDays(nextFuture.startDate, -1).getTime()))
         : plannedEnd;
      if (endDate >= today) {
         const result = await createGeneratedCycle(
            prisma,
            team,
            names,
            today,
            endDate,
            CycleStatus.ACTIVE
         );
         if (result.created) created += 1;
         currentEnd = endDate;
      }
   }

   const latestEnd = datedCycles.reduce<Date | undefined>(
      (latest, { endDate }) => (!latest || endDate > latest ? endDate : latest),
      currentEnd
   );
   const horizon = addUtcDays(today, durationDays);
   let cursor = latestEnd;
   while (!cursor || cursor < horizon) {
      const startDate = cursor ? addUtcDays(cursor, 1) : today;
      const endDate = addUtcDays(startDate, durationDays - 1);
      const status = startDate <= today ? CycleStatus.ACTIVE : CycleStatus.UPCOMING;
      const result = await createGeneratedCycle(prisma, team, names, startDate, endDate, status);
      if (result.created) created += 1;
      cursor = endDate;
   }

   return { created, activated, completed: completed.count };
}

export async function runCycleCadence(
   prisma: PrismaClient,
   now = new Date()
): Promise<CycleCadenceRunResult> {
   const today = startOfUtcDay(now);
   const teams = await prisma.team.findMany({
      where: { archivedAt: null, cycleCadenceWeeks: { not: null } },
      select: { id: true, workspaceId: true, cycleCadenceWeeks: true },
   });
   const result: CycleCadenceRunResult = {
      teams: teams.length,
      created: 0,
      activated: 0,
      completed: 0,
   };
   for (const team of teams) {
      if (!team.cycleCadenceWeeks) continue;
      const applied = await applyTeamCadence(prisma, team as CadenceTeam, today);
      result.created += applied.created;
      result.activated += applied.activated;
      result.completed += applied.completed;
   }
   return result;
}
