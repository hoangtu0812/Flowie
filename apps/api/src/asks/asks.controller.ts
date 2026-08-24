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
import { AsksService } from './asks.service';
import { CreateAskDto } from './dto/create-ask.dto';
import { UpdateAskDto } from './dto/update-ask.dto';

@UseGuards(AuthGuard)
@Controller('asks')
export class AsksController {
   constructor(private readonly asks: AsksService) {}

   @Get()
   async list(
      @Query('workspaceId') workspaceId: string,
      @Req() request: AuthenticatedRequest
   ) {
      return { data: await this.asks.list(workspaceId, request.auth!.userId) };
   }

   @Post()
   async create(@Body() dto: CreateAskDto, @Req() request: AuthenticatedRequest) {
      return { data: await this.asks.create(dto, request.auth!.userId) };
   }

   @Patch(':askId')
   async update(
      @Param('askId') askId: string,
      @Query('workspaceId') workspaceId: string,
      @Body() dto: UpdateAskDto,
      @Req() request: AuthenticatedRequest
   ) {
      return { data: await this.asks.update(askId, workspaceId, dto, request.auth!.userId) };
   }

   @Post(':askId/convert')
   async convert(
      @Param('askId') askId: string,
      @Query('workspaceId') workspaceId: string,
      @Req() request: AuthenticatedRequest
   ) {
      return { data: await this.asks.convert(askId, workspaceId, request.auth!.userId) };
   }

   @Delete(':askId')
   async archive(
      @Param('askId') askId: string,
      @Query('workspaceId') workspaceId: string,
      @Req() request: AuthenticatedRequest
   ) {
      return { data: await this.asks.archive(askId, workspaceId, request.auth!.userId) };
   }
}
