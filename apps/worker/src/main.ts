import { PrismaClient } from '@circle/database';
import { Worker } from 'bullmq';

type DiscordJob = { workspaceId: string; content: string };
const redisUrl = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
const connection = {
   host: redisUrl.hostname,
   port: Number(redisUrl.port || 6379),
   ...(redisUrl.password ? { password: redisUrl.password } : {}),
};
const prisma = new PrismaClient();

const worker = new Worker<DiscordJob>(
   'flowie-jobs',
   async (job) => {
      if (job.name !== 'discord-webhook') throw new Error(`Unsupported job: ${job.name}`);
      const webhook = await prisma.discordWebhook.findUnique({
         where: { workspaceId: job.data.workspaceId },
      });
      if (!webhook?.enabled) return { skipped: true };
      const response = await fetch(webhook.webhookUrl, {
         method: 'POST',
         headers: { 'content-type': 'application/json' },
         body: JSON.stringify({ content: job.data.content }),
      });
      if (!response.ok) throw new Error(`Discord responded with ${response.status}`);
      return { delivered: true };
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
