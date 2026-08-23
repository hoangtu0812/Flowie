import { Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { NotificationsService, type NotificationResponse } from './notifications.service';

@UseGuards(AuthGuard)
@Controller('notifications')
export class NotificationsController {
   constructor(private readonly notifications: NotificationsService) {}

   @Get()
   async list(@Req() request: AuthenticatedRequest): Promise<{ data: NotificationResponse[] }> {
      return { data: await this.notifications.list(request.auth!.userId) };
   }

   @Post('read-all')
   async markAllRead(@Req() request: AuthenticatedRequest) {
      await this.notifications.markAllRead(request.auth!.userId);
      return { data: { ok: true } };
   }

   @Delete()
   async deleteAll(@Req() request: AuthenticatedRequest) {
      return { data: await this.notifications.deleteAll(request.auth!.userId) };
   }

   @Delete('read')
   async deleteRead(@Req() request: AuthenticatedRequest) {
      return { data: await this.notifications.deleteRead(request.auth!.userId) };
   }

   @Delete('completed-issues')
   async deleteCompletedIssues(@Req() request: AuthenticatedRequest) {
      return { data: await this.notifications.deleteForCompletedIssues(request.auth!.userId) };
   }

   @Post(':notificationId/read')
   async markRead(
      @Param('notificationId') notificationId: string,
      @Req() request: AuthenticatedRequest
   ): Promise<{ data: NotificationResponse }> {
      return { data: await this.notifications.markRead(notificationId, request.auth!.userId) };
   }
}
