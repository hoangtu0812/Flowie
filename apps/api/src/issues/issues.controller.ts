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
import { IssueStatusCategory } from '@circle/database';
import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { CreateIssueDto } from './dto/create-issue.dto';
import { LinkIssueDto } from './dto/link-issue.dto';
import { IssueReactionDto } from './dto/issue-reaction.dto';
import { UpdateIssueDto } from './dto/update-issue.dto';
import { IssuesService } from './issues.service';

@UseGuards(AuthGuard)
@Controller('issues')
export class IssuesController {
   constructor(private readonly issues: IssuesService) {}

   @Get()
   async list(
      @Query('workspaceId') workspaceId: string,
      @Query('teamId') teamId: string | undefined,
      @Query('categories') categoryInput: string | undefined,
      @Query('scope') scope: 'assigned' | 'created' | 'subscribed' | 'activity' | undefined,
      @Req() request: AuthenticatedRequest
   ) {
      const categories = categoryInput
         ?.split(',')
         .filter((value): value is IssueStatusCategory =>
            Object.values(IssueStatusCategory).includes(value as IssueStatusCategory)
         );
      return {
         data: await this.issues.list(workspaceId, request.auth!.userId, teamId, categories, scope),
      };
   }

   @Post()
   async create(@Body() dto: CreateIssueDto, @Req() request: AuthenticatedRequest) {
      return { data: await this.issues.create(dto, request.auth!.userId) };
   }

   @Get('options')
   async options(
      @Query('workspaceId') workspaceId: string,
      @Query('teamId') teamId: string | undefined,
      @Req() request: AuthenticatedRequest
   ) {
      return { data: await this.issues.options(workspaceId, request.auth!.userId, teamId) };
   }

   @Get(':issueId/sub-issues')
   async subIssues(
      @Param('issueId') issueId: string,
      @Query('workspaceId') workspaceId: string,
      @Req() request: AuthenticatedRequest
   ) {
      return { data: await this.issues.subIssues(issueId, workspaceId, request.auth!.userId) };
   }

   @Get(':issueId/reactions')
   async reactions(
      @Param('issueId') issueId: string,
      @Query('workspaceId') workspaceId: string,
      @Req() request: AuthenticatedRequest
   ) {
      return { data: await this.issues.reactions(issueId, workspaceId, request.auth!.userId) };
   }

   @Post(':issueId/reactions')
   async addReaction(
      @Param('issueId') issueId: string,
      @Body() dto: IssueReactionDto,
      @Req() request: AuthenticatedRequest
   ) {
      return { data: await this.issues.addReaction(issueId, dto, request.auth!.userId) };
   }

   @Delete(':issueId/reactions/:emoji')
   async removeReaction(
      @Param('issueId') issueId: string,
      @Param('emoji') emoji: string,
      @Query('workspaceId') workspaceId: string,
      @Req() request: AuthenticatedRequest
   ) {
      return {
         data: await this.issues.removeReaction(issueId, emoji, workspaceId, request.auth!.userId),
      };
   }

   @Get(':issueId/relations')
   async relations(
      @Param('issueId') issueId: string,
      @Query('workspaceId') workspaceId: string,
      @Req() request: AuthenticatedRequest
   ) {
      return { data: await this.issues.relations(issueId, workspaceId, request.auth!.userId) };
   }

   @Post(':issueId/relations')
   async addRelation(
      @Param('issueId') issueId: string,
      @Body() dto: LinkIssueDto,
      @Req() request: AuthenticatedRequest
   ) {
      return { data: await this.issues.addRelation(issueId, dto, request.auth!.userId) };
   }

   @Delete(':issueId/relations/:relatedIssueId')
   async removeRelation(
      @Param('issueId') issueId: string,
      @Param('relatedIssueId') relatedIssueId: string,
      @Query('workspaceId') workspaceId: string,
      @Req() request: AuthenticatedRequest
   ) {
      return {
         data: await this.issues.removeRelation(
            issueId,
            relatedIssueId,
            workspaceId,
            request.auth!.userId
         ),
      };
   }

   @Get(':issueId')
   async get(
      @Param('issueId') issueId: string,
      @Query('workspaceId') workspaceId: string,
      @Req() request: AuthenticatedRequest
   ) {
      return { data: await this.issues.get(issueId, workspaceId, request.auth!.userId) };
   }

   @Post(':issueId/subscribers/me')
   async subscribe(
      @Param('issueId') issueId: string,
      @Query('workspaceId') workspaceId: string,
      @Req() request: AuthenticatedRequest
   ) {
      return { data: await this.issues.subscribe(issueId, workspaceId, request.auth!.userId) };
   }

   @Delete(':issueId/subscribers/me')
   async unsubscribe(
      @Param('issueId') issueId: string,
      @Query('workspaceId') workspaceId: string,
      @Req() request: AuthenticatedRequest
   ) {
      await this.issues.unsubscribe(issueId, workspaceId, request.auth!.userId);
      return { data: { ok: true } };
   }

   @Patch(':issueId')
   async update(
      @Param('issueId') issueId: string,
      @Query('workspaceId') workspaceId: string,
      @Body() dto: UpdateIssueDto,
      @Req() request: AuthenticatedRequest
   ) {
      return { data: await this.issues.update(issueId, workspaceId, dto, request.auth!.userId) };
   }

   @Delete(':issueId')
   async archive(
      @Param('issueId') issueId: string,
      @Query('workspaceId') workspaceId: string,
      @Req() request: AuthenticatedRequest
   ) {
      return { data: await this.issues.archive(issueId, workspaceId, request.auth!.userId) };
   }
}
