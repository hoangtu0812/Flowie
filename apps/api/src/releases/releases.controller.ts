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
import { CreateReleaseDto } from './dto/create-release.dto';
import { UpdateReleaseDto } from './dto/update-release.dto';
import { ReleasesService } from './releases.service';

@UseGuards(AuthGuard)
@Controller('releases')
export class ReleasesController {
   constructor(private readonly releases: ReleasesService) {}

   @Get()
   async list(
      @Query('workspaceId') workspaceId: string,
      @Req() request: AuthenticatedRequest
   ) {
      return { data: await this.releases.list(workspaceId, request.auth!.userId) };
   }

   @Post()
   async create(@Body() dto: CreateReleaseDto, @Req() request: AuthenticatedRequest) {
      return { data: await this.releases.create(dto, request.auth!.userId) };
   }

   @Patch(':releaseId')
   async update(
      @Param('releaseId') releaseId: string,
      @Query('workspaceId') workspaceId: string,
      @Body() dto: UpdateReleaseDto,
      @Req() request: AuthenticatedRequest
   ) {
      return {
         data: await this.releases.update(releaseId, workspaceId, dto, request.auth!.userId),
      };
   }

   @Delete(':releaseId')
   async archive(
      @Param('releaseId') releaseId: string,
      @Query('workspaceId') workspaceId: string,
      @Req() request: AuthenticatedRequest
   ) {
      return { data: await this.releases.archive(releaseId, workspaceId, request.auth!.userId) };
   }
}
