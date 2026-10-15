import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@circle/database';
import type { Worker } from 'bullmq';

export function trackWorker(prisma: PrismaClient, worker: Worker) {
   const instanceId = randomUUID();
   let pending: Promise<void> = Promise.resolve();
   const record = (error?: string, progress = false, stopped = false) => {
      pending = pending.then(async () => {
         const now = new Date();
         const status = stopped ? 'stopped' : worker.isRunning() ? 'running' : 'starting';
         await prisma.operationHeartbeat.upsert({
            where: { instanceId_job: { instanceId, job: 'bullmq-worker' } },
            create: { instanceId, job: 'bullmq-worker', status, lastSeenAt: now,
               lastProgressAt: progress ? now : undefined, failures: error ? 1 : 0, lastErrorCode: error },
            update: { status, lastSeenAt: now,
               ...(progress ? { lastProgressAt: now, lastErrorCode: null } : {}),
               ...(error ? { failures: { increment: 1 }, lastErrorCode: error } : {}),
            },
         });
      }).catch(() => { console.error('Worker heartbeat persistence is unavailable.'); });
      return pending;
   };
   worker.on('completed', () => { void record(undefined, true); });
   worker.on('failed', () => { void record('JobFailure'); });
   const timer = setInterval(() => { void record(); }, 15000);
   timer.unref();
   void record();
   return async () => { clearInterval(timer); await record(undefined, false, true); };
}
