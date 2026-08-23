import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@circle/database';
import { PrismaService } from '../database/prisma.service';
import { JobsService } from '../jobs/jobs.service';

export type NotificationResponse = {
   id: string;
   type: string;
   entityType: string;
   entityId: string;
   data: unknown;
   readAt: Date | null;
   createdAt: Date;
};

@Injectable()
export class NotificationsService {
   constructor(
      private readonly prisma: PrismaService,
      private readonly jobs: JobsService
   ) {}

   async notifyWorkspace(
      workspaceId: string,
      actorId: string,
      type: string,
      entityType: string,
      entityId: string,
      data: Record<string, unknown>,
      discordContent: string
   ) {
      const [recipients, actor] = await Promise.all([
         this.prisma.workspaceMember.findMany({
            where: { workspaceId, status: 'ACTIVE', userId: { not: actorId } },
            select: { userId: true },
         }),
         this.prisma.user.findUnique({
            where: { id: actorId },
            select: { id: true, name: true, avatarUrl: true },
         }),
      ]);
      const notificationData = {
         ...data,
         ...(actor ? { actor } : {}),
      } as Prisma.InputJsonValue;
      if (recipients.length) {
         await this.prisma.notification.createMany({
            data: recipients.map((recipient) => ({
               userId: recipient.userId,
               type,
               entityType,
               entityId,
               data: notificationData,
            })),
         });
      }
      await this.jobs.enqueueDiscord({ workspaceId, content: discordContent });
   }

   async list(userId: string): Promise<NotificationResponse[]> {
      const notifications = await this.prisma.notification.findMany({
         where: { userId },
         orderBy: { createdAt: 'desc' },
      });
      return notifications.map((notification) => this.toResponse(notification));
   }

   async markRead(notificationId: string, userId: string): Promise<NotificationResponse> {
      const notification = await this.prisma.notification.findFirst({
         where: { id: notificationId, userId },
      });
      if (!notification) throw new NotFoundException('Notification not found.');
      const updated = await this.prisma.notification.update({
         where: { id: notificationId },
         data: { readAt: notification.readAt ?? new Date() },
      });
      return this.toResponse(updated);
   }

   async markAllRead(userId: string) {
      await this.prisma.notification.updateMany({
         where: { userId, readAt: null },
         data: { readAt: new Date() },
      });
   }

   async deleteAll(userId: string) {
      return this.prisma.notification.deleteMany({ where: { userId } });
   }

   async deleteRead(userId: string) {
      return this.prisma.notification.deleteMany({
         where: { userId, readAt: { not: null } },
      });
   }

   async deleteForCompletedIssues(userId: string) {
      const issueNotifications = await this.prisma.notification.findMany({
         where: { userId, entityType: 'issue' },
         select: { entityId: true },
      });
      const issueIds = [...new Set(issueNotifications.map((notification) => notification.entityId))];
      if (!issueIds.length) return { count: 0 };

      const completedIssues = await this.prisma.issue.findMany({
         where: {
            id: { in: issueIds },
            status: { category: { in: ['COMPLETED', 'CANCELED'] } },
         },
         select: { id: true },
      });
      const completedIssueIds = completedIssues.map((issue) => issue.id);
      if (!completedIssueIds.length) return { count: 0 };

      return this.prisma.notification.deleteMany({
         where: { userId, entityType: 'issue', entityId: { in: completedIssueIds } },
      });
   }

   private toResponse(notification: {
      id: string;
      type: string;
      entityType: string;
      entityId: string;
      data: unknown;
      readAt: Date | null;
      createdAt: Date;
   }): NotificationResponse {
      return notification;
   }
}
