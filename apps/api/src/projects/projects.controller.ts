import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { CreateProjectDto } from './dto/create-project.dto';
import { ProjectsService } from './projects.service';
@UseGuards(AuthGuard)
@Controller('projects')
export class ProjectsController {
   constructor(private readonly projects: ProjectsService) {}
   @Get() async list(
      @Query('workspaceId') workspaceId: string,
      @Req() request: AuthenticatedRequest
   ) {
      return { data: await this.projects.list(workspaceId, request.auth!.userId) };
   }
   @Post() async create(@Body() dto: CreateProjectDto, @Req() request: AuthenticatedRequest) {
      return { data: await this.projects.create(dto, request.auth!.userId) };
   }
}
