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
import { CreateSlaPolicyDto } from './dto/create-sla-policy.dto';
import { UpdateSlaPolicyDto } from './dto/update-sla-policy.dto';
import { SlasService } from './slas.service';

@UseGuards(AuthGuard)
@Controller('slas')
export class SlasController {
   constructor(private readonly slas: SlasService) {}

   @Get()
   async list(
      @Query('workspaceId') workspaceId: string,
      @Req() request: AuthenticatedRequest
   ) {
      return { data: await this.slas.list(workspaceId, request.auth!.userId) };
   }

   @Post()
   async create(@Body() dto: CreateSlaPolicyDto, @Req() request: AuthenticatedRequest) {
      return { data: await this.slas.create(dto, request.auth!.userId) };
   }

   @Patch(':policyId')
   async update(
      @Param('policyId') policyId: string,
      @Query('workspaceId') workspaceId: string,
      @Body() dto: UpdateSlaPolicyDto,
      @Req() request: AuthenticatedRequest
   ) {
      return { data: await this.slas.update(policyId, workspaceId, dto, request.auth!.userId) };
   }

   @Delete(':policyId')
   async archive(
      @Param('policyId') policyId: string,
      @Query('workspaceId') workspaceId: string,
      @Req() request: AuthenticatedRequest
   ) {
      return { data: await this.slas.archive(policyId, workspaceId, request.auth!.userId) };
   }
}
