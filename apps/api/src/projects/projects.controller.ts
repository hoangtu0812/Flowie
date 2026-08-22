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
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { CreateProjectCustomFieldDto } from './dto/create-project-custom-field.dto';
import { UpdateProjectCustomFieldDto } from './dto/update-project-custom-field.dto';
import { CreateMilestoneDto } from './dto/create-milestone.dto';
import { UpdateMilestoneDto } from './dto/update-milestone.dto';
import { CreateProjectTemplateDto } from './dto/create-project-template.dto';
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
   @Get('custom-fields') async listCustomFields(
      @Query('workspaceId') workspaceId: string,
      @Req() request: AuthenticatedRequest
   ): Promise<{ data: unknown }> {
      return { data: await this.projects.listCustomFields(workspaceId, request.auth!.userId) };
   }
   @Post('custom-fields') async createCustomField(
      @Body() dto: CreateProjectCustomFieldDto,
      @Req() request: AuthenticatedRequest
   ): Promise<{ data: unknown }> {
      return { data: await this.projects.createCustomField(dto, request.auth!.userId) };
   }
   @Patch('custom-fields/:fieldId') async updateCustomField(
      @Param('fieldId') fieldId: string,
      @Query('workspaceId') workspaceId: string,
      @Body() dto: UpdateProjectCustomFieldDto,
      @Req() request: AuthenticatedRequest
   ): Promise<{ data: unknown }> {
      return {
         data: await this.projects.updateCustomField(
            fieldId,
            workspaceId,
            dto,
            request.auth!.userId
         ),
      };
   }
   @Delete('custom-fields/:fieldId') async removeCustomField(
      @Param('fieldId') fieldId: string,
      @Query('workspaceId') workspaceId: string,
      @Req() request: AuthenticatedRequest
   ) {
      return {
         data: await this.projects.removeCustomField(fieldId, workspaceId, request.auth!.userId),
      };
   }
   @Get('templates') async listTemplates(
      @Query('workspaceId') workspaceId: string,
      @Req() request: AuthenticatedRequest
   ): Promise<{ data: unknown }> {
      return { data: await this.projects.listTemplates(workspaceId, request.auth!.userId) };
   }
   @Post('templates') async createTemplate(
      @Body() dto: CreateProjectTemplateDto,
      @Req() request: AuthenticatedRequest
   ): Promise<{ data: unknown }> {
      return { data: await this.projects.createTemplate(dto, request.auth!.userId) };
   }
   @Get(':projectId/issues') async issues(
      @Param('projectId') projectId: string,
      @Query('workspaceId') workspaceId: string,
      @Req() request: AuthenticatedRequest
   ) {
      return { data: await this.projects.issues(projectId, workspaceId, request.auth!.userId) };
   }
   @Get(':projectId/milestones') async listMilestones(
      @Param('projectId') projectId: string,
      @Query('workspaceId') workspaceId: string,
      @Req() request: AuthenticatedRequest
   ) {
      return {
         data: await this.projects.listMilestones(projectId, workspaceId, request.auth!.userId),
      };
   }
   @Post(':projectId/milestones') async createMilestone(
      @Param('projectId') projectId: string,
      @Body() dto: CreateMilestoneDto,
      @Req() request: AuthenticatedRequest
   ) {
      return { data: await this.projects.createMilestone(projectId, dto, request.auth!.userId) };
   }
   @Patch(':projectId/milestones/:milestoneId') async updateMilestone(
      @Param('projectId') projectId: string,
      @Param('milestoneId') milestoneId: string,
      @Query('workspaceId') workspaceId: string,
      @Body() dto: UpdateMilestoneDto,
      @Req() request: AuthenticatedRequest
   ) {
      return {
         data: await this.projects.updateMilestone(
            milestoneId,
            projectId,
            workspaceId,
            dto,
            request.auth!.userId
         ),
      };
   }
   @Delete(':projectId/milestones/:milestoneId') async removeMilestone(
      @Param('projectId') projectId: string,
      @Param('milestoneId') milestoneId: string,
      @Query('workspaceId') workspaceId: string,
      @Req() request: AuthenticatedRequest
   ) {
      return {
         data: await this.projects.removeMilestone(
            milestoneId,
            projectId,
            workspaceId,
            request.auth!.userId
         ),
      };
   }
   @Get(':projectId') async get(
      @Param('projectId') projectId: string,
      @Query('workspaceId') workspaceId: string,
      @Req() request: AuthenticatedRequest
   ) {
      return { data: await this.projects.get(projectId, workspaceId, request.auth!.userId) };
   }
   @Patch(':projectId') async update(
      @Param('projectId') projectId: string,
      @Query('workspaceId') workspaceId: string,
      @Body() dto: UpdateProjectDto,
      @Req() request: AuthenticatedRequest
   ) {
      return {
         data: await this.projects.update(projectId, workspaceId, dto, request.auth!.userId),
      };
   }
   @Delete(':projectId') async archive(
      @Param('projectId') projectId: string,
      @Query('workspaceId') workspaceId: string,
      @Req() request: AuthenticatedRequest
   ) {
      return { data: await this.projects.archive(projectId, workspaceId, request.auth!.userId) };
   }
}
