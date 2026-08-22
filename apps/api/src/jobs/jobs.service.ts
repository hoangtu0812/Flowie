import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';

type DiscordJob = { workspaceId: string; content: string };

@Injectable()
export class JobsService implements OnModuleDestroy {
   private readonly queue: Queue<DiscordJob>;

   constructor(config: ConfigService) {
      const redisUrl = new URL(config.get<string>('REDIS_URL', 'redis://localhost:6379'));
      this.queue = new Queue<DiscordJob>('flowie-jobs', {
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

   async onModuleDestroy() {
      await this.queue.close();
   }
}
