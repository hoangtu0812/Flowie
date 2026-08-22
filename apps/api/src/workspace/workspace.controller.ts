import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { WorkspaceService } from './workspace.service';

@ApiTags('workspaces')
@ApiCookieAuth('flowie_access')
@UseGuards(AuthGuard)
@Controller('workspaces')
export class WorkspaceController {
   constructor(private readonly workspaces: WorkspaceService) {}

   @Get('me')
   @ApiOkResponse({ description: 'Workspaces available to the signed-in user.' })
   async mine(@Req() request: AuthenticatedRequest) {
      return { data: await this.workspaces.listForUser(request.auth!.userId) };
   }

   @Get(':workspaceId/members')
   async members(@Param('workspaceId') workspaceId: string, @Req() request: AuthenticatedRequest) {
      return { data: await this.workspaces.members(workspaceId, request.auth!.userId) };
   }
}
