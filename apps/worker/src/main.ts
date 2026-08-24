import { PrismaClient } from '@circle/database';
import { Queue, Worker } from 'bullmq';
import { runTeamPolicies } from './team-policies.js';
import { runCycleCadence } from './cycle-cadence.js';

type DiscordJob = { workspaceId: string; content: string };
type IssueReminderJob = { reminderId: string };
type TeamPolicyJob = Record<string, never>;
type FlowieJob = DiscordJob | IssueReminderJob | TeamPolicyJob;
const redisUrl = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
const connection = {
   host: redisUrl.hostname,
   port: Number(redisUrl.port || 6379),
   ...(redisUrl.password ? { password: redisUrl.password } : {}),
};
const prisma = new PrismaClient();
const queue = new Queue<FlowieJob>('flowie-jobs', { connection });

const worker = new Worker<FlowieJob>(
   'flowie-jobs',
   async (job) => {
      if (job.name === 'discord-webhook') {
         const data = job.data as DiscordJob;
         const webhook = await prisma.discordWebhook.findUnique({
            where: { workspaceId: data.workspaceId },
         });
         if (!webhook?.enabled) return { skipped: true };
         const response = await fetch(webhook.webhookUrl, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ content: data.content }),
         });
         if (!response.ok) throw new Error(`Discord responded with ${response.status}`);
         return { delivered: true };
      }
      if (job.name === 'issue-reminder') {
         const data = job.data as IssueReminderJob;
         const reminder = await prisma.issueReminder.findUnique({
            where: { id: data.reminderId },
            include: {
               issue: {
                  select: {
                     id: true,
                     workspaceId: true,
                     identifier: true,
                     title: true,
                     archivedAt: true,
                  },
               },
            },
         });
         if (!reminder || reminder.deliveredAt || reminder.issue.archivedAt) {
            return { skipped: true };
         }
         if (reminder.remindAt.getTime() > Date.now() + 1_000) return { skipped: true };
         await prisma.$transaction([
            prisma.notification.create({
               data: {
                  workspaceId: reminder.issue.workspaceId,
                  userId: reminder.userId,
                  type: 'issue.reminder',
                  entityType: 'issue',
                  entityId: reminder.issue.id,
                  data: {
                     identifier: reminder.issue.identifier,
                     title: reminder.issue.title,
                     remindAt: reminder.remindAt.toISOString(),
                  },
               },
            }),
            prisma.issueReminder.update({
               where: { id: reminder.id },
               data: { deliveredAt: new Date() },
            }),
         ]);
         return { delivered: true };
      }
      if (job.name === 'team-policy-scan') {
         const [policies, cycles] = await Promise.all([
            runTeamPolicies(prisma),
            runCycleCadence(prisma),
         ]);
         console.log(
            `Team policy scan completed: ${policies.teams} retention teams, ${policies.closed} closed, ${policies.archived} archived; ${cycles.teams} cadence teams, ${cycles.created} cycles created, ${cycles.activated} activated, ${cycles.completed} completed.`
         );
         return { policies, cycles };
      }
      throw new Error(`Unsupported job: ${job.name}`);
   },
   { connection }
);

worker.on('ready', () => {
   console.log('Flowie worker is connected to Redis.');
});

worker.on('failed', (job, error) => {
   console.error(`Job ${job?.id ?? 'unknown'} failed:`, error);
});

async function scheduleTeamPolicies() {
   const configuredInterval = Number(process.env.TEAM_POLICY_SCAN_INTERVAL_MS ?? 60 * 60 * 1_000);
   const every = Number.isFinite(configuredInterval)
      ? Math.max(configuredInterval, 60_000)
      : 60 * 60 * 1_000;
   await queue.upsertJobScheduler(
      'team-policy-scan',
      { every },
      {
         name: 'team-policy-scan',
         data: {},
         opts: {
            attempts: 3,
            backoff: { type: 'exponential', delay: 5_000 },
            removeOnComplete: 100,
            removeOnFail: 500,
         },
      }
   );
   const initial = await queue.getJob('team-policy-scan-initial');
   if (!initial) {
      await queue.add(
         'team-policy-scan',
         {},
         {
            jobId: 'team-policy-scan-initial',
            removeOnComplete: true,
            removeOnFail: 100,
         }
      );
   }
}

void scheduleTeamPolicies().catch((error: unknown) => {
   console.error('Could not schedule team policy scans:', error);
});

async function shutdown(signal: NodeJS.Signals) {
   console.log(`Received ${signal}; closing worker.`);
   await worker.close();
   await queue.close();
   await prisma.$disconnect();
   process.exit(0);
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
