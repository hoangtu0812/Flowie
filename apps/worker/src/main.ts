import { PrismaClient } from '@circle/database';
import { Worker } from 'bullmq';

type DiscordJob = { workspaceId: string; content: string };
type IssueReminderJob = { reminderId: string };
type FlowieJob = DiscordJob | IssueReminderJob;
const redisUrl = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
const connection = {
   host: redisUrl.hostname,
   port: Number(redisUrl.port || 6379),
   ...(redisUrl.password ? { password: redisUrl.password } : {}),
};
const prisma = new PrismaClient();

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

async function shutdown(signal: NodeJS.Signals) {
   console.log(`Received ${signal}; closing worker.`);
   await worker.close();
   await prisma.$disconnect();
   process.exit(0);
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
