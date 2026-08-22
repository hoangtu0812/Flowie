import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

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
   constructor(private readonly prisma: PrismaService) {}

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
