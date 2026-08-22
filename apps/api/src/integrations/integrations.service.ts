import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class IntegrationsService {
   private readonly logger = new Logger(IntegrationsService.name);
   constructor(private readonly prisma: PrismaService) {}

   async discord(workspaceId: string, userId: string) {
      await this.authorize(workspaceId, userId);
      return this.prisma.discordWebhook.findUnique({ where: { workspaceId }, select: { enabled: true, webhookUrl: true, updatedAt: true } });
   }
   async saveDiscord(workspaceId: string, userId: string, webhookUrl: string, enabled: boolean) {
      await this.authorize(workspaceId, userId);
      return this.prisma.discordWebhook.upsert({ where: { workspaceId }, create: { workspaceId, webhookUrl, enabled }, update: { webhookUrl, enabled }, select: { enabled: true, webhookUrl: true, updatedAt: true } });
   }
   async testDiscord(workspaceId: string, userId: string) {
      await this.authorize(workspaceId, userId);
      return this.publish(workspaceId, '✅ Flowie đã kết nối Discord thành công.');
   }
   async publish(workspaceId: string, content: string) {
      const webhook = await this.prisma.discordWebhook.findUnique({ where: { workspaceId } });
      if (!webhook?.enabled) return false;
      try { const response = await fetch(webhook.webhookUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content }) }); return response.ok; }
      catch (error) { this.logger.warn(`Discord delivery failed: ${error instanceof Error ? error.message : 'unknown error'}`); return false; }
   }
   private async authorize(workspaceId: string, userId: string) {
      const membership = await this.prisma.workspaceMember.findFirst({ where: { workspaceId, userId, status: 'ACTIVE' } });
      if (!membership) throw new ForbiddenException('You do not have access to this workspace.');
   }
}
