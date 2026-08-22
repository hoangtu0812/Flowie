import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { CycleStatus } from '@circle/database';
import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { AddIssueToCycleDto } from './dto/add-issue-to-cycle.dto';
import { CreateCycleDto } from './dto/create-cycle.dto';
import { UpdateCycleDto } from './dto/update-cycle.dto';
import { CyclesService } from './cycles.service';

@UseGuards(AuthGuard)
@Controller('cycles')
export class CyclesController {
   constructor(private readonly cycles: CyclesService) {}

   @Get()
   async list(
      @Query('workspaceId') workspaceId: string,
      @Query('teamId') teamId: string,
      @Query('status') status: CycleStatus | undefined,
      @Req() request: AuthenticatedRequest
   ) {
      return { data: await this.cycles.list(workspaceId, teamId, request.auth!.userId, status) };
   }

   @Post()
   async create(@Body() dto: CreateCycleDto, @Req() request: AuthenticatedRequest) {
      return { data: await this.cycles.create(dto, request.auth!.userId) };
   }

   @Patch(':cycleId')
   async update(
      @Param('cycleId') cycleId: string,
      @Query('workspaceId') workspaceId: string,
      @Body() dto: UpdateCycleDto,
      @Req() request: AuthenticatedRequest
   ) {
      return { data: await this.cycles.update(cycleId, workspaceId, dto, request.auth!.userId) };
   }

   @Post(':cycleId/issues')
   async addIssue(
      @Param('cycleId') cycleId: string,
      @Body() dto: AddIssueToCycleDto,
      @Req() request: AuthenticatedRequest
   ) {
      return { data: await this.cycles.addIssue(cycleId, dto, request.auth!.userId) };
   }

   @Get(':cycleId/issues')
   async issues(
      @Param('cycleId') cycleId: string,
      @Query('workspaceId') workspaceId: string,
      @Req() request: AuthenticatedRequest
   ) {
      return { data: await this.cycles.issues(cycleId, workspaceId, request.auth!.userId) };
   }
}
