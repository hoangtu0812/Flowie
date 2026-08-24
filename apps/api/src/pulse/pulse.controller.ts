import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { PulseService } from './pulse.service';

@UseGuards(AuthGuard)
@Controller('pulse')
export class PulseController {
   constructor(private readonly pulse: PulseService) {}

   @Get()
   async list(
      @Query('workspaceId') workspaceId: string,
      @Query('limit') limitInput: string | undefined,
      @Req() request: AuthenticatedRequest
   ) {
      return {
         data: await this.pulse.list(workspaceId, request.auth!.userId, Number(limitInput) || 100),
      };
   }
}
