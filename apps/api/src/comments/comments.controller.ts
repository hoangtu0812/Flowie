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
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { ToggleCommentReactionDto } from './dto/toggle-comment-reaction.dto';
import {
   CommentsService,
   type CommentListResponse,
   type CommentReactionResponse,
   type CommentResponse,
   type DeletedCommentResponse,
} from './comments.service';

@UseGuards(AuthGuard)
@Controller('comments')
export class CommentsController {
   constructor(private readonly comments: CommentsService) {}

   @Get()
   async list(
      @Query('workspaceId') workspaceId: string,
      @Query('issueId') issueId: string,
      @Req() request: AuthenticatedRequest
   ): Promise<{ data: CommentListResponse[] }> {
      return { data: await this.comments.list(workspaceId, issueId, request.auth!.userId) };
   }

   @Post()
   async create(
      @Body() dto: CreateCommentDto,
      @Req() request: AuthenticatedRequest
   ): Promise<{ data: CommentResponse }> {
      return { data: await this.comments.create(dto, request.auth!.userId) };
   }

   @Patch(':commentId')
   async update(
      @Param('commentId') commentId: string,
      @Query('workspaceId') workspaceId: string,
      @Body() dto: UpdateCommentDto,
      @Req() request: AuthenticatedRequest
   ): Promise<{ data: CommentResponse }> {
      return {
         data: await this.comments.update(commentId, workspaceId, dto, request.auth!.userId),
      };
   }

   @Delete(':commentId')
   async remove(
      @Param('commentId') commentId: string,
      @Query('workspaceId') workspaceId: string,
      @Req() request: AuthenticatedRequest
   ): Promise<{ data: DeletedCommentResponse }> {
      return { data: await this.comments.remove(commentId, workspaceId, request.auth!.userId) };
   }

   @Get(':commentId/reactions')
   async reactions(
      @Param('commentId') commentId: string,
      @Query('workspaceId') workspaceId: string,
      @Req() request: AuthenticatedRequest
   ): Promise<{ data: CommentReactionResponse[] }> {
      return {
         data: await this.comments.reactions(commentId, workspaceId, request.auth!.userId),
      };
   }

   @Post(':commentId/reactions/toggle')
   async toggleReaction(
      @Param('commentId') commentId: string,
      @Body() dto: ToggleCommentReactionDto,
      @Req() request: AuthenticatedRequest
   ): Promise<{ data: CommentReactionResponse[] }> {
      return {
         data: await this.comments.toggleReaction(
            commentId,
            dto.workspaceId,
            dto.emoji,
            request.auth!.userId
         ),
      };
   }
}
