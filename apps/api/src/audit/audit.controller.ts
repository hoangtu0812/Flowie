import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { AuditService } from './audit.service';

@UseGuards(AuthGuard)
@Controller('audit')
export class AuditController {
   constructor(private readonly audit: AuditService) {}

   @Get()
   async list(
      @Query('workspaceId') workspaceId: string,
      @Req() request: AuthenticatedRequest
   ): Promise<{ data: unknown }> {
      return { data: await this.audit.workspaceLogs(workspaceId, request.auth!.userId) };
   }
}
