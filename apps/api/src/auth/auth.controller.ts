import { Body, Controller, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import { ApiCookieAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import type { AuthResponse } from '@circle/contracts';

import { AuthService, type AuthSession, type RequestMetadata } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { RegisterDto } from './dto/register.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
   constructor(
      private readonly authService: AuthService,
      private readonly config: ConfigService
   ) {}

   @Post('register')
   @ApiCreatedResponse({ description: 'A user and their first workspace were created.' })
   async register(
      @Body() dto: RegisterDto,
      @Req() request: Request,
      @Res({ passthrough: true }) response: Response
   ): Promise<{ data: AuthResponse }> {
      const session = await this.authService.register(dto, this.requestMetadata(request));
      this.setAuthCookies(response, session);
      return { data: this.toResponse(session) };
   }

   @Post('login')
   @HttpCode(HttpStatus.OK)
   @ApiOkResponse({ description: 'An authenticated session was created.' })
   async login(
      @Body() dto: LoginDto,
      @Req() request: Request,
      @Res({ passthrough: true }) response: Response
   ): Promise<{ data: AuthResponse }> {
      const session = await this.authService.login(dto, this.requestMetadata(request));
      this.setAuthCookies(response, session);
      return { data: this.toResponse(session) };
   }

   @Post('refresh')
   @HttpCode(HttpStatus.OK)
   @ApiCookieAuth('flowie_refresh')
   @ApiOkResponse({
      description: 'The refresh token was rotated and a new access cookie was issued.',
   })
   async refresh(
      @Body() dto: RefreshDto,
      @Req() request: Request,
      @Res({ passthrough: true }) response: Response
   ): Promise<{ data: AuthResponse }> {
      const refreshToken = dto.refreshToken ?? this.readCookie(request, 'flowie_refresh');
      const session = await this.authService.refresh(
         refreshToken ?? '',
         this.requestMetadata(request)
      );
      this.setAuthCookies(response, session);
      return { data: this.toResponse(session) };
   }

   @Post('logout')
   @HttpCode(HttpStatus.NO_CONTENT)
   @ApiCookieAuth('flowie_refresh')
   async logout(
      @Req() request: Request,
      @Res({ passthrough: true }) response: Response
   ): Promise<void> {
      await this.authService.logout(this.readCookie(request, 'flowie_refresh'));
      response.clearCookie('flowie_access', this.cookieOptions());
      response.clearCookie('flowie_refresh', this.cookieOptions());
   }

   private setAuthCookies(response: Response, session: AuthSession): void {
      response.cookie('flowie_access', session.accessToken, {
         ...this.cookieOptions(),
         maxAge: this.accessTokenTtlSeconds() * 1000,
      });
      response.cookie('flowie_refresh', session.refreshToken, {
         ...this.cookieOptions(),
         maxAge: this.refreshTokenTtlDays() * 24 * 60 * 60 * 1000,
      });
   }

   private cookieOptions() {
      return {
         httpOnly: true,
         secure: this.config.get<string>('NODE_ENV') === 'production',
         sameSite: 'lax' as const,
         path: '/api/v1/auth',
      };
   }

   private requestMetadata(request: Request): RequestMetadata {
      return {
         ipAddress: request.ip,
         userAgent: request.get('user-agent'),
      };
   }

   private readCookie(request: Request, name: string): string | undefined {
      const cookieHeader = request.headers.cookie;
      if (!cookieHeader) return undefined;
      return cookieHeader
         .split(';')
         .map((entry) => entry.trim().split('='))
         .find(([key]) => key === name)
         ?.slice(1)
         .join('=');
   }

   private toResponse(session: AuthSession): AuthResponse {
      return { user: session.user, workspace: session.workspace };
   }

   private accessTokenTtlSeconds(): number {
      return Number(this.config.get('AUTH_ACCESS_TOKEN_TTL_SECONDS', 900));
   }

   private refreshTokenTtlDays(): number {
      return Number(this.config.get('AUTH_REFRESH_TOKEN_TTL_DAYS', 30));
   }
}
