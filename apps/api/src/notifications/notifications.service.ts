import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@circle/database';
import { PrismaService } from '../database/prisma.service';
import { JobsService } from '../jobs/jobs.service';

export type NotificationResponse = {
   id: string;
   workspaceId: string;
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
      const recipients = await this.prisma.workspaceMember.findMany({
         where: { workspaceId, status: 'ACTIVE', userId: { not: actorId } },
         select: { userId: true },
      });
      return this.notifyUsers(
         recipients.map((recipient) => recipient.userId),
         workspaceId,
         actorId,
         type,
         entityType,
         entityId,
         data,
         discordContent
      );
   }

   async notifyUsers(
      recipientIds: string[],
      workspaceId: string,
      actorId: string,
      type: string,
      entityType: string,
      entityId: string,
      data: Record<string, unknown>,
      discordContent: string
   ) {
      const recipientIdsWithoutActor = [...new Set(recipientIds)].filter((id) => id !== actorId);
      const activeRecipients = recipientIdsWithoutActor.length
         ? await this.prisma.workspaceMember.findMany({
              where: {
                 workspaceId,
                 status: 'ACTIVE',
                 userId: { in: recipientIdsWithoutActor },
              },
              select: { userId: true },
           })
         : [];
      const actor = await this.prisma.user.findUnique({
         where: { id: actorId },
         select: { id: true, name: true, avatarUrl: true },
      });
      const notificationData = {
         ...data,
         ...(actor ? { actor } : {}),
      } as Prisma.InputJsonValue;
      if (activeRecipients.length) {
         await this.prisma.notification.createMany({
            data: activeRecipients.map(({ userId }) => ({
               workspaceId,
               userId,
               type,
               entityType,
               entityId,
               data: notificationData,
            })),
         });
      }
      await this.jobs.enqueueDiscord({ workspaceId, content: discordContent });
   }

   async list(workspaceId: string, userId: string): Promise<NotificationResponse[]> {
      await this.authorize(workspaceId, userId);
      const notifications = await this.prisma.notification.findMany({
         where: { workspaceId, userId },
         orderBy: { createdAt: 'desc' },
      });
      return notifications.map((notification) => this.toResponse(notification));
   }

   async markRead(
      notificationId: string,
      workspaceId: string,
      userId: string
   ): Promise<NotificationResponse> {
      await this.authorize(workspaceId, userId);
      const notification = await this.prisma.notification.findFirst({
         where: { id: notificationId, workspaceId, userId },
      });
      if (!notification) throw new NotFoundException('Notification not found.');
      const updated = await this.prisma.notification.update({
         where: { id: notificationId },
         data: { readAt: notification.readAt ?? new Date() },
      });
      return this.toResponse(updated);
   }

   async markAllRead(workspaceId: string, userId: string) {
      await this.authorize(workspaceId, userId);
      await this.prisma.notification.updateMany({
         where: { workspaceId, userId, readAt: null },
         data: { readAt: new Date() },
      });
   }

   async deleteAll(workspaceId: string, userId: string) {
      await this.authorize(workspaceId, userId);
      return this.prisma.notification.deleteMany({ where: { workspaceId, userId } });
   }

   async deleteRead(workspaceId: string, userId: string) {
      await this.authorize(workspaceId, userId);
      return this.prisma.notification.deleteMany({
         where: { workspaceId, userId, readAt: { not: null } },
      });
   }

   async deleteForCompletedIssues(workspaceId: string, userId: string) {
      await this.authorize(workspaceId, userId);
      const issueNotifications = await this.prisma.notification.findMany({
         where: { workspaceId, userId, entityType: 'issue' },
         select: { entityId: true },
      });
      const issueIds = [...new Set(issueNotifications.map((notification) => notification.entityId))];
      if (!issueIds.length) return { count: 0 };

      const completedIssues = await this.prisma.issue.findMany({
         where: {
            workspaceId,
            id: { in: issueIds },
            status: { category: { in: ['COMPLETED', 'CANCELED'] } },
         },
         select: { id: true },
      });
      const completedIssueIds = completedIssues.map((issue) => issue.id);
      if (!completedIssueIds.length) return { count: 0 };

      return this.prisma.notification.deleteMany({
         where: {
            workspaceId,
            userId,
            entityType: 'issue',
            entityId: { in: completedIssueIds },
         },
      });
   }

   private async authorize(workspaceId: string, userId: string) {
      if (!workspaceId?.trim()) throw new BadRequestException('workspaceId is required.');
      const membership = await this.prisma.workspaceMember.findFirst({
         where: { workspaceId, userId, status: 'ACTIVE' },
         select: { id: true },
      });
      if (!membership) throw new NotFoundException('Workspace not found.');
   }

   private toResponse(notification: {
      id: string;
      workspaceId: string;
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
