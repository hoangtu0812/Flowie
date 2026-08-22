import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { ActivitiesService, type ActivityResponse } from './activities.service';

@UseGuards(AuthGuard)
@Controller('activities')
export class ActivitiesController {
   constructor(private readonly activities: ActivitiesService) {}

   @Get()
   async list(
      @Query('workspaceId') workspaceId: string,
      @Query('issueId') issueId: string | undefined,
      @Query('projectId') projectId: string | undefined,
      @Req() request: AuthenticatedRequest
   ): Promise<{ data: ActivityResponse[] }> {
      return {
         data: await this.activities.list(workspaceId, request.auth!.userId, issueId, projectId),
      };
   }
}
