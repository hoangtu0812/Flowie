import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';

type DiscordJob = { workspaceId: string; content: string };
type IssueReminderJob = { reminderId: string };
type FlowieJob = DiscordJob | IssueReminderJob;

@Injectable()
export class JobsService implements OnModuleDestroy {
   private readonly queue: Queue<FlowieJob>;

   constructor(config: ConfigService) {
      const redisUrl = new URL(config.get<string>('REDIS_URL', 'redis://localhost:6379'));
      this.queue = new Queue<FlowieJob>('flowie-jobs', {
         connection: {
            host: redisUrl.hostname,
            port: Number(redisUrl.port || 6379),
            ...(redisUrl.password ? { password: redisUrl.password } : {}),
         },
      });
   }

   async enqueueDiscord(payload: DiscordJob) {
      await this.queue.add('discord-webhook', payload, {
         attempts: 5,
         backoff: { type: 'exponential', delay: 1_000 },
         removeOnComplete: 1_000,
         removeOnFail: 5_000,
      });
   }

   async enqueueIssueReminder(reminderId: string, remindAt: Date) {
      const jobId = `issue-reminder-${reminderId}`;
      const existing = await this.queue.getJob(jobId);
      if (existing) await existing.remove();
      await this.queue.add(
         'issue-reminder',
         { reminderId },
         {
            jobId,
            delay: Math.max(remindAt.getTime() - Date.now(), 0),
            attempts: 3,
            backoff: { type: 'exponential', delay: 1_000 },
            removeOnComplete: 1_000,
            removeOnFail: 5_000,
         }
      );
   }

   async cancelIssueReminder(reminderId: string) {
      const existing = await this.queue.getJob(`issue-reminder-${reminderId}`);
      if (existing) await existing.remove();
   }

   async onModuleDestroy() {
      await this.queue.close();
   }
}
