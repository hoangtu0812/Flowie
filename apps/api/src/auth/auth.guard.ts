import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';

export interface AuthenticatedRequest extends Request {
   auth?: { userId: string };
}

@Injectable()
export class AuthGuard implements CanActivate {
   constructor(
      private readonly jwt: JwtService,
      private readonly config: ConfigService
   ) {}

   async canActivate(context: ExecutionContext): Promise<boolean> {
      const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
      const token = request.headers.cookie
         ?.split(';')
         .map((value) => value.trim().split('='))
         .find(([name]) => name === 'flowie_access')
         ?.slice(1)
         .join('=');
      if (!token) throw new UnauthorizedException('Sign in is required.');
      try {
         const payload = await this.jwt.verifyAsync<{ sub: string }>(token, {
            secret: this.config.get<string>('AUTH_JWT_SECRET', 'development-only-change-me'),
         });
         request.auth = { userId: payload.sub };
         return true;
      } catch {
         throw new UnauthorizedException('Your session has expired. Please sign in again.');
      }
   }
}
