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
import { PortfolioService } from './portfolio.service';
import { CreateSavedViewDto } from './dto/create-saved-view.dto';
import { CreateInitiativeDto } from './dto/create-initiative.dto';
import { UpdateInitiativeDto } from './dto/update-initiative.dto';
import { LinkProjectDto } from './dto/link-project.dto';
import { CreateInitiativeUpdateDto } from './dto/create-initiative-update.dto';
import { CreateInitiativeResourceDto } from './dto/create-initiative-resource.dto';

@UseGuards(AuthGuard)
@Controller()
export class PortfolioController {
   constructor(private readonly portfolio: PortfolioService) {}
   @Get('views') async views(
      @Query('workspaceId') workspaceId: string,
      @Req() request: AuthenticatedRequest
   ): Promise<{ data: unknown }> {
      return { data: await this.portfolio.savedViews(workspaceId, request.auth!.userId) };
   }
   @Post('views') async createView(
      @Body() dto: CreateSavedViewDto,
      @Req() request: AuthenticatedRequest
   ): Promise<{ data: unknown }> {
      return { data: await this.portfolio.createSavedView(dto, request.auth!.userId) };
   }
   @Delete('views/:viewId') async removeView(
      @Param('viewId') viewId: string,
      @Query('workspaceId') workspaceId: string,
      @Req() request: AuthenticatedRequest
   ) {
      return {
         data: await this.portfolio.removeSavedView(viewId, workspaceId, request.auth!.userId),
      };
   }
   @Get('initiatives') async initiatives(
      @Query('workspaceId') workspaceId: string,
      @Req() request: AuthenticatedRequest
   ) {
      return { data: await this.portfolio.initiatives(workspaceId, request.auth!.userId) };
   }
   @Post('initiatives') async createInitiative(
      @Body() dto: CreateInitiativeDto,
      @Req() request: AuthenticatedRequest
   ) {
      return { data: await this.portfolio.createInitiative(dto, request.auth!.userId) };
   }
   @Patch('initiatives/:initiativeId') async updateInitiative(
      @Param('initiativeId') initiativeId: string,
      @Query('workspaceId') workspaceId: string,
      @Body() dto: UpdateInitiativeDto,
      @Req() request: AuthenticatedRequest
   ) {
      return {
         data: await this.portfolio.updateInitiative(
            initiativeId,
            workspaceId,
            dto,
            request.auth!.userId
         ),
      };
   }
   @Delete('initiatives/:initiativeId') async archiveInitiative(
      @Param('initiativeId') initiativeId: string,
      @Query('workspaceId') workspaceId: string,
      @Req() request: AuthenticatedRequest
   ) {
      return {
         data: await this.portfolio.archiveInitiative(
            initiativeId,
            workspaceId,
            request.auth!.userId
         ),
      };
   }
   @Post('initiatives/:initiativeId/projects') async linkProject(
      @Param('initiativeId') initiativeId: string,
      @Body() dto: LinkProjectDto,
      @Req() request: AuthenticatedRequest
   ) {
      return {
         data: await this.portfolio.linkProject(
            initiativeId,
            dto.workspaceId,
            dto.projectId,
            request.auth!.userId
         ),
      };
   }
   @Get('initiatives/:initiativeId/activity') async initiativeActivity(
      @Param('initiativeId') initiativeId: string,
      @Query('workspaceId') workspaceId: string,
      @Req() request: AuthenticatedRequest
   ): Promise<{ data: unknown }> {
      return {
         data: await this.portfolio.initiativeActivity(
            initiativeId,
            workspaceId,
            request.auth!.userId
         ),
      };
   }
   @Post('initiatives/:initiativeId/updates') async createInitiativeUpdate(
      @Param('initiativeId') initiativeId: string,
      @Body() dto: CreateInitiativeUpdateDto,
      @Req() request: AuthenticatedRequest
   ) {
      return {
         data: await this.portfolio.createInitiativeUpdate(initiativeId, dto, request.auth!.userId),
      };
   }
   @Post('initiatives/:initiativeId/resources') async addInitiativeResource(
      @Param('initiativeId') initiativeId: string,
      @Body() dto: CreateInitiativeResourceDto,
      @Req() request: AuthenticatedRequest
   ) {
      return {
         data: await this.portfolio.addInitiativeResource(initiativeId, dto, request.auth!.userId),
      };
   }
   @Delete('initiatives/:initiativeId/projects/:projectId') async unlinkProject(
      @Param('initiativeId') initiativeId: string,
      @Param('projectId') projectId: string,
      @Query('workspaceId') workspaceId: string,
      @Req() request: AuthenticatedRequest
   ) {
      return {
         data: await this.portfolio.unlinkProject(
            initiativeId,
            workspaceId,
            projectId,
            request.auth!.userId
         ),
      };
   }
}
