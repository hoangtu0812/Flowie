import { Controller, Delete, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { NotificationsService, type NotificationResponse } from './notifications.service';

@UseGuards(AuthGuard)
@Controller('notifications')
export class NotificationsController {
   constructor(private readonly notifications: NotificationsService) {}

   @Get()
   async list(
      @Query('workspaceId') workspaceId: string,
      @Req() request: AuthenticatedRequest
   ): Promise<{ data: NotificationResponse[] }> {
      return { data: await this.notifications.list(workspaceId, request.auth!.userId) };
   }

   @Post('read-all')
   async markAllRead(
      @Query('workspaceId') workspaceId: string,
      @Req() request: AuthenticatedRequest
   ) {
      await this.notifications.markAllRead(workspaceId, request.auth!.userId);
      return { data: { ok: true } };
   }

   @Delete()
   async deleteAll(
      @Query('workspaceId') workspaceId: string,
      @Req() request: AuthenticatedRequest
   ) {
      return { data: await this.notifications.deleteAll(workspaceId, request.auth!.userId) };
   }

   @Delete('read')
   async deleteRead(
      @Query('workspaceId') workspaceId: string,
      @Req() request: AuthenticatedRequest
   ) {
      return { data: await this.notifications.deleteRead(workspaceId, request.auth!.userId) };
   }

   @Delete('completed-issues')
   async deleteCompletedIssues(
      @Query('workspaceId') workspaceId: string,
      @Req() request: AuthenticatedRequest
   ) {
      return {
         data: await this.notifications.deleteForCompletedIssues(
            workspaceId,
            request.auth!.userId
         ),
      };
   }

   @Post(':notificationId/read')
   async markRead(
      @Param('notificationId') notificationId: string,
      @Query('workspaceId') workspaceId: string,
      @Req() request: AuthenticatedRequest
   ): Promise<{ data: NotificationResponse }> {
      return {
         data: await this.notifications.markRead(
            notificationId,
            workspaceId,
            request.auth!.userId
         ),
      };
   }
}
