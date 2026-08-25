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
import { CreateLabelGroupDto } from './dto/create-label-group.dto';
import { CreateLabelDto } from './dto/create-label.dto';
import { UpdateLabelGroupDto } from './dto/update-label-group.dto';
import { UpdateLabelDto } from './dto/update-label.dto';
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

   @Get('groups')
   async listGroups(
      @Query('workspaceId') workspaceId: string,
      @Req() request: AuthenticatedRequest
   ) {
      return { data: await this.labels.listGroups(workspaceId, request.auth!.userId) };
   }

   @Post('groups')
   async createGroup(@Body() dto: CreateLabelGroupDto, @Req() request: AuthenticatedRequest) {
      return { data: await this.labels.createGroup(dto, request.auth!.userId) };
   }

   @Patch('groups/:groupId')
   async updateGroup(
      @Param('groupId') groupId: string,
      @Query('workspaceId') workspaceId: string,
      @Body() dto: UpdateLabelGroupDto,
      @Req() request: AuthenticatedRequest
   ) {
      return {
         data: await this.labels.updateGroup(groupId, workspaceId, dto, request.auth!.userId),
      };
   }

   @Delete('groups/:groupId')
   async removeGroup(
      @Param('groupId') groupId: string,
      @Query('workspaceId') workspaceId: string,
      @Req() request: AuthenticatedRequest
   ) {
      return { data: await this.labels.removeGroup(groupId, workspaceId, request.auth!.userId) };
   }

   @Patch(':labelId')
   async update(
      @Param('labelId') labelId: string,
      @Query('workspaceId') workspaceId: string,
      @Body() dto: UpdateLabelDto,
      @Req() request: AuthenticatedRequest
   ) {
      return { data: await this.labels.update(labelId, workspaceId, dto, request.auth!.userId) };
   }

   @Delete(':labelId')
   async remove(
      @Param('labelId') labelId: string,
      @Query('workspaceId') workspaceId: string,
      @Req() request: AuthenticatedRequest
   ) {
      return { data: await this.labels.remove(labelId, workspaceId, request.auth!.userId) };
   }
}
