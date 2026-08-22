import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { IssueStatusCategory } from '@circle/database';
import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { CreateIssueDto } from './dto/create-issue.dto';
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
      @Query('scope') scope: 'assigned' | 'created' | undefined,
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

   @Get(':issueId')
   async get(
      @Param('issueId') issueId: string,
      @Query('workspaceId') workspaceId: string,
      @Req() request: AuthenticatedRequest
   ) {
      return { data: await this.issues.get(issueId, workspaceId, request.auth!.userId) };
   }
}
