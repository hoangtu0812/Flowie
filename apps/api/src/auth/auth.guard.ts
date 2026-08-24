import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { createHash } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';

export interface AuthenticatedRequest extends Request {
   auth?: { userId: string };
}

@Injectable()
export class AuthGuard implements CanActivate {
   constructor(
      private readonly jwt: JwtService,
      private readonly config: ConfigService,
      private readonly prisma: PrismaService
   ) {}

   async canActivate(context: ExecutionContext): Promise<boolean> {
      const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
      const bearer = request.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
      if (bearer?.startsWith('flowie_pat_')) {
         const key = await this.prisma.personalApiKey.findFirst({
            where: {
               tokenHash: createHash('sha256').update(bearer).digest('hex'),
               revokedAt: null,
               OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
               user: { status: 'ACTIVE' },
            },
            select: { id: true, userId: true, lastUsedAt: true },
         });
         if (!key) throw new UnauthorizedException('The API key is invalid or expired.');
         request.auth = { userId: key.userId };
         if (!key.lastUsedAt || key.lastUsedAt.getTime() < Date.now() - 5 * 60 * 1_000) {
            void this.prisma.personalApiKey
               .update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
               .catch(() => undefined);
         }
         return true;
      }
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
