import {
   Body,
   Controller,
   Delete,
   Get,
   Param,
   Patch,
   Post,
   Query,
   Req,
   UseGuards,
} from '@nestjs/common';
import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { CreateTeamDto } from './dto/create-team.dto';
import { AddTeamMemberDto } from './dto/add-team-member.dto';
import { UpdateTeamMemberDto } from './dto/update-team-member.dto';
import { UpdateTeamDto } from './dto/update-team.dto';
import { TeamsService } from './teams.service';

@UseGuards(AuthGuard)
@Controller('teams')
export class TeamsController {
   constructor(private readonly teams: TeamsService) {}
   @Get() async list(
      @Query('workspaceId') workspaceId: string,
      @Req() request: AuthenticatedRequest
   ) {
      return { data: await this.teams.list(workspaceId, request.auth!.userId) };
   }
   @Post() async create(@Body() dto: CreateTeamDto, @Req() request: AuthenticatedRequest) {
      return { data: await this.teams.create(dto, request.auth!.userId) };
   }
   @Get('deleted') async listDeleted(
      @Query('workspaceId') workspaceId: string,
      @Req() request: AuthenticatedRequest
   ) {
      return { data: await this.teams.listDeleted(workspaceId, request.auth!.userId) };
   }
   @Get(':teamId') async get(
      @Param('teamId') teamId: string,
      @Query('workspaceId') workspaceId: string,
      @Req() request: AuthenticatedRequest
   ) {
      return { data: await this.teams.get(teamId, workspaceId, request.auth!.userId) };
   }
   @Patch(':teamId') async update(
      @Param('teamId') teamId: string,
      @Query('workspaceId') workspaceId: string,
      @Body() dto: UpdateTeamDto,
      @Req() request: AuthenticatedRequest
   ) {
      return { data: await this.teams.update(teamId, workspaceId, dto, request.auth!.userId) };
   }
   @Delete(':teamId') async archive(
      @Param('teamId') teamId: string,
      @Query('workspaceId') workspaceId: string,
      @Req() request: AuthenticatedRequest
   ) {
      return { data: await this.teams.archive(teamId, workspaceId, request.auth!.userId) };
   }
   @Post(':teamId/schedule-deletion') async scheduleDeletion(
      @Param('teamId') teamId: string,
      @Query('workspaceId') workspaceId: string,
      @Req() request: AuthenticatedRequest
   ) {
      return {
         data: await this.teams.scheduleDeletion(teamId, workspaceId, request.auth!.userId),
      };
   }
   @Post(':teamId/restore') async restore(
      @Param('teamId') teamId: string,
      @Query('workspaceId') workspaceId: string,
      @Req() request: AuthenticatedRequest
   ) {
      return { data: await this.teams.restore(teamId, workspaceId, request.auth!.userId) };
   }
   @Post(':teamId/members') async addMember(
      @Param('teamId') teamId: string,
      @Body() dto: AddTeamMemberDto,
      @Req() request: AuthenticatedRequest
   ) {
      return { data: await this.teams.addMember(teamId, dto, request.auth!.userId) };
   }
   @Post(':teamId/join') async join(
      @Param('teamId') teamId: string,
      @Query('workspaceId') workspaceId: string,
      @Req() request: AuthenticatedRequest
   ) {
      return { data: await this.teams.join(teamId, workspaceId, request.auth!.userId) };
   }
   @Post(':teamId/leave') async leave(
      @Param('teamId') teamId: string,
      @Query('workspaceId') workspaceId: string,
      @Req() request: AuthenticatedRequest
   ) {
      return { data: await this.teams.leave(teamId, workspaceId, request.auth!.userId) };
   }
   @Patch(':teamId/members/:userId') async updateMember(
      @Param('teamId') teamId: string,
      @Param('userId') userId: string,
      @Query('workspaceId') workspaceId: string,
      @Body() dto: UpdateTeamMemberDto,
      @Req() request: AuthenticatedRequest
   ) {
      return {
         data: await this.teams.updateMember(
            teamId,
            userId,
            workspaceId,
            dto.role,
            request.auth!.userId
         ),
      };
   }
   @Delete(':teamId/members/:userId') async removeMember(
      @Param('teamId') teamId: string,
      @Param('userId') userId: string,
      @Query('workspaceId') workspaceId: string,
      @Req() request: AuthenticatedRequest
   ) {
      return {
         data: await this.teams.removeMember(teamId, userId, workspaceId, request.auth!.userId),
      };
   }
}
