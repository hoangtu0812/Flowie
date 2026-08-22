import {
   Body,
   Controller,
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
import { AttachmentsService, type UploadedFile as StoredFile } from './attachments.service';
import { CreateAttachmentDto } from './dto/create-attachment.dto';

@UseGuards(AuthGuard)
@Controller('attachments')
export class AttachmentsController {
   constructor(private readonly attachments: AttachmentsService) {}

   @Get()
   async list(
      @Query('workspaceId') workspaceId: string,
      @Query('entityType') entityType: string,
      @Query('entityId') entityId: string,
      @Req() request: AuthenticatedRequest
   ) {
      return {
         data: await this.attachments.list(workspaceId, entityType, entityId, request.auth!.userId),
      };
   }

   @Post()
   @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
   async create(
      @Body() dto: CreateAttachmentDto,
      @UploadedFile() file: StoredFile | undefined,
      @Req() request: AuthenticatedRequest
   ) {
      return { data: await this.attachments.create(dto, file, request.auth!.userId) };
   }

   @Get(':attachmentId/download')
   async download(
      @Param('attachmentId') attachmentId: string,
      @Req() request: AuthenticatedRequest,
      @Res() response: Response
   ) {
      const { attachment, body } = await this.attachments.download(
         attachmentId,
         request.auth!.userId
      );
      response.setHeader('content-type', attachment.mimeType);
      response.setHeader(
         'content-disposition',
         `attachment; filename="${attachment.filename.replace(/"/g, '')}"`
      );
      response.send(body);
   }
}
