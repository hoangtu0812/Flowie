import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { IsBoolean, IsUrl } from 'class-validator';
import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { IntegrationsService } from './integrations.service';
class DiscordDto { @IsUrl({ require_tld: false }) webhookUrl!: string; @IsBoolean() enabled!: boolean; }
@UseGuards(AuthGuard)
@Controller('integrations')
export class IntegrationsController {
   constructor(private readonly integrations: IntegrationsService) {}
   @Get('discord') async discord(@Query('workspaceId') workspaceId: string, @Req() request: AuthenticatedRequest) { return { data: await this.integrations.discord(workspaceId, request.auth!.userId) }; }
   @Post('discord') async save(@Query('workspaceId') workspaceId: string, @Body() dto: DiscordDto, @Req() request: AuthenticatedRequest) { return { data: await this.integrations.saveDiscord(workspaceId, request.auth!.userId, dto.webhookUrl, dto.enabled) }; }
   @Post('discord/test') async test(@Query('workspaceId') workspaceId: string, @Req() request: AuthenticatedRequest) { return { data: { delivered: await this.integrations.testDiscord(workspaceId, request.auth!.userId) } }; }
}
