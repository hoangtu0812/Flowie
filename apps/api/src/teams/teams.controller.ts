import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { CreateTeamDto } from './dto/create-team.dto';
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
   @Get(':teamId') async get(
      @Param('teamId') teamId: string,
      @Query('workspaceId') workspaceId: string,
      @Req() request: AuthenticatedRequest
   ) {
      return { data: await this.teams.get(teamId, workspaceId, request.auth!.userId) };
   }
}
