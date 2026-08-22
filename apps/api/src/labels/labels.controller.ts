import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { CreateLabelDto } from './dto/create-label.dto';
import { LabelsService } from './labels.service';

@UseGuards(AuthGuard)
@Controller('labels')
export class LabelsController {
   constructor(private readonly labels: LabelsService) {}

   @Get()
   async list(@Query('workspaceId') workspaceId: string, @Req() request: AuthenticatedRequest) {
      return { data: await this.labels.list(workspaceId, request.auth!.userId) };
   }

   @Post()
   async create(@Body() dto: CreateLabelDto, @Req() request: AuthenticatedRequest) {
      return { data: await this.labels.create(dto, request.auth!.userId) };
   }
}
