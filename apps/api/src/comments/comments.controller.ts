import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { CreateCommentDto } from './dto/create-comment.dto';
import { CommentsService } from './comments.service';

@UseGuards(AuthGuard)
@Controller('comments')
export class CommentsController {
   constructor(private readonly comments: CommentsService) {}

   @Get()
   async list(
      @Query('workspaceId') workspaceId: string,
      @Query('issueId') issueId: string,
      @Req() request: AuthenticatedRequest
   ) {
      return { data: await this.comments.list(workspaceId, issueId, request.auth!.userId) };
   }

   @Post()
   async create(@Body() dto: CreateCommentDto, @Req() request: AuthenticatedRequest) {
      return { data: await this.comments.create(dto, request.auth!.userId) };
   }
}
