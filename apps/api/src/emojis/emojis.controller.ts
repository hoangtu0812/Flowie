import {
   Body,
   Controller,
   Delete,
   Get,
   Param,
   Post,
   Query,
   Req,
   Res,
   UploadedFile,
   UseGuards,
   UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { CreateWorkspaceEmojiDto } from './dto/create-workspace-emoji.dto';
import { EmojisService, type UploadedEmojiFile } from './emojis.service';

@UseGuards(AuthGuard)
@Controller('emojis')
export class EmojisController {
   constructor(private readonly emojis: EmojisService) {}

   @Get()
   async list(
      @Query('workspaceId') workspaceId: string,
      @Req() request: AuthenticatedRequest
   ) {
      return { data: await this.emojis.list(workspaceId, request.auth!.userId) };
   }

   @Post()
   @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 512 * 1024 } }))
   async create(
      @Body() dto: CreateWorkspaceEmojiDto,
      @UploadedFile() file: UploadedEmojiFile | undefined,
      @Req() request: AuthenticatedRequest
   ) {
      return { data: await this.emojis.create(dto, file, request.auth!.userId) };
   }

   @Get(':emojiId/image')
   async image(
      @Param('emojiId') emojiId: string,
      @Query('workspaceId') workspaceId: string,
      @Req() request: AuthenticatedRequest,
      @Res() response: Response
   ) {
      const { emoji, body } = await this.emojis.image(
         emojiId,
         workspaceId,
         request.auth!.userId
      );
      response.setHeader('content-type', emoji.mimeType);
      response.setHeader('cache-control', 'private, max-age=3600');
      response.setHeader('content-disposition', `inline; filename="${emoji.filename}"`);
      response.send(body);
   }

   @Delete(':emojiId')
   async archive(
      @Param('emojiId') emojiId: string,
      @Query('workspaceId') workspaceId: string,
      @Req() request: AuthenticatedRequest
   ) {
      return { data: await this.emojis.archive(emojiId, workspaceId, request.auth!.userId) };
   }
}
