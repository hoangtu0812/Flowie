import { Worker } from 'bullmq';

const redisUrl = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
const connection = {
   host: redisUrl.hostname,
   port: Number(redisUrl.port || 6379),
   ...(redisUrl.password ? { password: redisUrl.password } : {}),
};

const worker = new Worker(
   'circle-jobs',
   async (job) => {
      // Phase 1 intentionally has no producer yet. This worker establishes the
      // shared queue boundary for email, notifications, webhooks and automation.
      console.log(`Received job ${job.name} (${job.id})`);
   },
   { connection },
);

worker.on('ready', () => {
   console.log('Circle worker is connected to Redis.');
});

worker.on('failed', (job, error) => {
   console.error(`Job ${job?.id ?? 'unknown'} failed:`, error);
});

async function shutdown(signal: NodeJS.Signals) {
   console.log(`Received ${signal}; closing worker.`);
   await worker.close();
   process.exit(0);
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
