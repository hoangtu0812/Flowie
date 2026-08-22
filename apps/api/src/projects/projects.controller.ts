import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { CreateProjectDto } from './dto/create-project.dto';
import { ProjectsService } from './projects.service';
@UseGuards(AuthGuard)
@Controller('projects')
export class ProjectsController {
   constructor(private readonly projects: ProjectsService) {}
   @Get() async list(
      @Query('workspaceId') workspaceId: string,
      @Query('teamId') teamId: string | undefined,
      @Req() request: AuthenticatedRequest
   ) {
      return { data: await this.projects.list(workspaceId, request.auth!.userId, teamId) };
   }
   @Post() async create(@Body() dto: CreateProjectDto, @Req() request: AuthenticatedRequest) {
      return { data: await this.projects.create(dto, request.auth!.userId) };
   }
   @Get(':projectId/issues') async issues(
      @Param('projectId') projectId: string,
      @Query('workspaceId') workspaceId: string,
      @Req() request: AuthenticatedRequest
   ) {
      return { data: await this.projects.issues(projectId, workspaceId, request.auth!.userId) };
   }
   @Get(':projectId') async get(
      @Param('projectId') projectId: string,
      @Query('workspaceId') workspaceId: string,
      @Req() request: AuthenticatedRequest
   ) {
      return { data: await this.projects.get(projectId, workspaceId, request.auth!.userId) };
   }
}
