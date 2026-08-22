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
import { CreateDocumentDto } from './dto/create-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { DocumentsService } from './documents.service';

@UseGuards(AuthGuard)
@Controller('documents')
export class DocumentsController {
   constructor(private readonly documents: DocumentsService) {}

   @Get()
   async list(
      @Query('workspaceId') workspaceId: string,
      @Query('teamId') teamId: string | undefined,
      @Req() request: AuthenticatedRequest
   ) {
      return { data: await this.documents.list(workspaceId, request.auth!.userId, teamId) };
   }

   @Post()
   async create(@Body() dto: CreateDocumentDto, @Req() request: AuthenticatedRequest) {
      return { data: await this.documents.create(dto, request.auth!.userId) };
   }

   @Patch(':documentId')
   async update(
      @Param('documentId') documentId: string,
      @Query('workspaceId') workspaceId: string,
      @Body() dto: UpdateDocumentDto,
      @Req() request: AuthenticatedRequest
   ) {
      return {
         data: await this.documents.update(documentId, workspaceId, dto, request.auth!.userId),
      };
   }

   @Delete(':documentId')
   async archive(
      @Param('documentId') documentId: string,
      @Query('workspaceId') workspaceId: string,
      @Req() request: AuthenticatedRequest
   ) {
      return { data: await this.documents.archive(documentId, workspaceId, request.auth!.userId) };
   }
}
