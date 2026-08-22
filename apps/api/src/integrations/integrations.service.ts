import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { JobsService } from '../jobs/jobs.service';

@Injectable()
export class IntegrationsService {
   constructor(
      private readonly prisma: PrismaService,
      private readonly jobs: JobsService
   ) {}

   async discord(workspaceId: string, userId: string) {
      await this.authorizeManager(workspaceId, userId);
      const webhook = await this.prisma.discordWebhook.findUnique({
         where: { workspaceId },
         select: { enabled: true, webhookUrl: true, updatedAt: true },
      });
      return webhook
         ? {
              enabled: webhook.enabled,
              webhookUrlMasked: this.maskWebhook(webhook.webhookUrl),
              updatedAt: webhook.updatedAt,
           }
         : null;
   }
   async saveDiscord(
      workspaceId: string,
      userId: string,
      webhookUrl: string | undefined,
      enabled: boolean
   ) {
      await this.authorizeManager(workspaceId, userId);
      const existing = await this.prisma.discordWebhook.findUnique({ where: { workspaceId } });
      if (!existing && !webhookUrl)
         throw new BadRequestException('A Discord webhook URL is required.');
      const webhook = existing
         ? await this.prisma.discordWebhook.update({
              where: { workspaceId },
              data: { ...(webhookUrl ? { webhookUrl } : {}), enabled },
           })
         : await this.prisma.discordWebhook.create({
              data: { workspaceId, webhookUrl: webhookUrl!, enabled },
           });
      return {
         enabled: webhook.enabled,
         webhookUrlMasked: this.maskWebhook(webhook.webhookUrl),
         updatedAt: webhook.updatedAt,
      };
   }
   async testDiscord(workspaceId: string, userId: string) {
      await this.authorizeManager(workspaceId, userId);
      await this.publish(workspaceId, '✅ Flowie đã kết nối Discord thành công.');
      return true;
   }
   async publish(workspaceId: string, content: string) {
      const webhook = await this.prisma.discordWebhook.findUnique({
         where: { workspaceId },
         select: { enabled: true },
      });
      if (!webhook?.enabled) return false;
      await this.jobs.enqueueDiscord({ workspaceId, content });
      return true;
   }
   private async authorizeManager(workspaceId: string, userId: string) {
      const membership = await this.prisma.workspaceMember.findFirst({
         where: { workspaceId, userId, status: 'ACTIVE', role: { in: ['OWNER', 'ADMIN'] } },
      });
      if (!membership) throw new ForbiddenException('Workspace administrator access is required.');
   }
   private maskWebhook(url: string) {
      return `${url.slice(0, 32)}••••${url.slice(-6)}`;
   }
}
