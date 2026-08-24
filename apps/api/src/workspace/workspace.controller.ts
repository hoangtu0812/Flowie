import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { WorkspaceService } from './workspace.service';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { UpdateProjectDisplayDefaultsDto } from './dto/update-project-display-defaults.dto';
import { UpdateIssueDisplayDefaultsDto } from './dto/update-issue-display-defaults.dto';
import { UpdateIssueInsightDefaultsDto } from './dto/update-issue-insight-defaults.dto';

@ApiTags('workspaces')
@ApiCookieAuth('flowie_access')
@UseGuards(AuthGuard)
@Controller('workspaces')
export class WorkspaceController {
   constructor(private readonly workspaces: WorkspaceService) {}

   @Get('me')
   @ApiOkResponse({ description: 'Workspaces available to the signed-in user.' })
   async mine(@Req() request: AuthenticatedRequest): Promise<{ data: unknown }> {
      return { data: await this.workspaces.listForUser(request.auth!.userId) };
   }

   @Get('invitations')
   async invitations(@Req() request: AuthenticatedRequest): Promise<{ data: unknown }> {
      return { data: await this.workspaces.pendingInvitations(request.auth!.userId) };
   }

   @Post()
   async create(
      @Body() dto: CreateWorkspaceDto,
      @Req() request: AuthenticatedRequest
   ): Promise<{ data: unknown }> {
      return { data: await this.workspaces.create(dto, request.auth!.userId) };
   }

   @Get(':workspaceId/project-display-defaults')
   async projectDisplayDefaults(
      @Param('workspaceId') workspaceId: string,
      @Req() request: AuthenticatedRequest
   ): Promise<{ data: unknown }> {
      return {
         data: await this.workspaces.projectDisplayDefaults(workspaceId, request.auth!.userId),
      };
   }

   @Patch(':workspaceId/project-display-defaults')
   async updateProjectDisplayDefaults(
      @Param('workspaceId') workspaceId: string,
      @Body() dto: UpdateProjectDisplayDefaultsDto,
      @Req() request: AuthenticatedRequest
   ): Promise<{ data: unknown }> {
      return {
         data: await this.workspaces.updateProjectDisplayDefaults(
            workspaceId,
            dto,
            request.auth!.userId
         ),
      };
   }

   @Get(':workspaceId/issue-display-defaults')
   async issueDisplayDefaults(
      @Param('workspaceId') workspaceId: string,
      @Req() request: AuthenticatedRequest
   ): Promise<{ data: unknown }> {
      return {
         data: await this.workspaces.issueDisplayDefaults(workspaceId, request.auth!.userId),
      };
   }

   @Patch(':workspaceId/issue-display-defaults')
   async updateIssueDisplayDefaults(
      @Param('workspaceId') workspaceId: string,
      @Body() dto: UpdateIssueDisplayDefaultsDto,
      @Req() request: AuthenticatedRequest
   ): Promise<{ data: unknown }> {
      return {
         data: await this.workspaces.updateIssueDisplayDefaults(
            workspaceId,
            dto,
            request.auth!.userId
         ),
      };
   }

   @Get(':workspaceId/issue-insight-defaults')
   async issueInsightDefaults(
      @Param('workspaceId') workspaceId: string,
      @Req() request: AuthenticatedRequest
   ): Promise<{ data: unknown }> {
      return {
         data: await this.workspaces.issueInsightDefaults(workspaceId, request.auth!.userId),
      };
   }

   @Patch(':workspaceId/issue-insight-defaults')
   async updateIssueInsightDefaults(
      @Param('workspaceId') workspaceId: string,
      @Body() dto: UpdateIssueInsightDefaultsDto,
      @Req() request: AuthenticatedRequest
   ): Promise<{ data: unknown }> {
      return {
         data: await this.workspaces.updateIssueInsightDefaults(
            workspaceId,
            dto,
            request.auth!.userId
         ),
      };
   }

   @Get(':workspaceId/members')
   async members(
      @Param('workspaceId') workspaceId: string,
      @Req() request: AuthenticatedRequest
   ): Promise<{ data: unknown }> {
      return { data: await this.workspaces.members(workspaceId, request.auth!.userId) };
   }

   @Post(':workspaceId/invitations')
   async invite(
      @Param('workspaceId') workspaceId: string,
      @Body() dto: InviteMemberDto,
      @Req() request: AuthenticatedRequest
   ): Promise<{ data: unknown }> {
      return { data: await this.workspaces.invite(workspaceId, dto, request.auth!.userId) };
   }

   @Post('invitations/:memberId/accept')
   async accept(
      @Param('memberId') memberId: string,
      @Req() request: AuthenticatedRequest
   ): Promise<{ data: unknown }> {
      return { data: await this.workspaces.acceptInvitation(memberId, request.auth!.userId) };
   }

   @Delete('invitations/:memberId')
   async decline(
      @Param('memberId') memberId: string,
      @Req() request: AuthenticatedRequest
   ): Promise<{ data: unknown }> {
      return { data: await this.workspaces.declineInvitation(memberId, request.auth!.userId) };
   }

   @Delete(':workspaceId/leave')
   async leave(
      @Param('workspaceId') workspaceId: string,
      @Req() request: AuthenticatedRequest
   ): Promise<{ data: unknown }> {
      return { data: await this.workspaces.leave(workspaceId, request.auth!.userId) };
   }

   @Patch(':workspaceId/members/:memberId')
   async updateMember(
      @Param('workspaceId') workspaceId: string,
      @Param('memberId') memberId: string,
      @Body() dto: UpdateMemberDto,
      @Req() request: AuthenticatedRequest
   ): Promise<{ data: unknown }> {
      return {
         data: await this.workspaces.updateMember(memberId, workspaceId, dto, request.auth!.userId),
      };
   }

   @Delete(':workspaceId/members/:memberId')
   async removeMember(
      @Param('workspaceId') workspaceId: string,
      @Param('memberId') memberId: string,
      @Req() request: AuthenticatedRequest
   ): Promise<{ data: unknown }> {
      return {
         data: await this.workspaces.removeMember(memberId, workspaceId, request.auth!.userId),
      };
   }
}
