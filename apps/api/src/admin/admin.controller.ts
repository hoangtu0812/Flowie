import { Body, Controller, Get, Param, Patch, Req, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { AdminService } from './admin.service';
import { PlatformAdminGuard } from './platform-admin.guard';
import { UpdateAdminUserDto } from './dto/update-admin-user.dto';

@ApiTags('admin')
@ApiCookieAuth('flowie_access')
@UseGuards(AuthGuard, PlatformAdminGuard)
@Controller('admin')
export class AdminController {
   constructor(private readonly admin: AdminService) {}

   @Get('overview')
   @ApiOkResponse({ description: 'Platform-wide administrative metrics.' })
   async overview() {
      return { data: await this.admin.overview() };
   }

   @Get('users')
   async users() {
      return { data: await this.admin.users() };
   }

   @Get('workspaces')
   async workspaces() {
      return { data: await this.admin.workspaces() };
   }

   @Get('audit')
   async audit(): Promise<{ data: unknown }> {
      return { data: await this.admin.auditLogs() };
   }

   @Patch('users/:userId')
   async updateUser(
      @Param('userId') userId: string,
      @Body() dto: UpdateAdminUserDto,
      @Req() request: AuthenticatedRequest
   ) {
      return { data: await this.admin.updateUser(request.auth!.userId, userId, dto) };
   }
}
