import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import type { AuthResponse, AuthenticatedUser } from '@circle/contracts';
import type { User } from '@circle/database';

import { PrismaService } from '../database/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

export interface RequestMetadata {
   ipAddress?: string;
   userAgent?: string;
}

export interface AuthSession extends AuthResponse {
   accessToken: string;
   refreshToken: string;
}

@Injectable()
export class AuthService {
   private readonly accessTokenTtlSeconds: number;
   private readonly refreshTokenTtlDays: number;
   private readonly jwtSecret: string;

   constructor(
      private readonly prisma: PrismaService,
      private readonly jwt: JwtService,
      config: ConfigService
   ) {
      this.accessTokenTtlSeconds = Number(config.get('AUTH_ACCESS_TOKEN_TTL_SECONDS', 900));
      this.refreshTokenTtlDays = Number(config.get('AUTH_REFRESH_TOKEN_TTL_DAYS', 30));
      this.jwtSecret = config.get<string>('AUTH_JWT_SECRET', 'development-only-change-me');
   }

   async register(dto: RegisterDto, metadata: RequestMetadata): Promise<AuthSession> {
      const existingUser = await this.prisma.user.findUnique({ where: { email: dto.email } });
      if (existingUser) {
         throw new ConflictException('An account already exists for this email address.');
      }

      const passwordHash = await argon2.hash(dto.password, { type: argon2.argon2id });
      const workspaceSlug = this.createWorkspaceSlug(dto.name);
      const user = await this.prisma.$transaction(async (tx) => {
         const createdUser = await tx.user.create({
            data: {
               email: dto.email,
               name: dto.name,
               passwordHash,
               identities: {
                  create: {
                     provider: 'LOCAL',
                     providerAccountId: dto.email,
                     email: dto.email,
                  },
               },
            },
         });
         const organization = await tx.organization.create({
            data: {
               name: `${dto.name}'s organization`,
               slug: workspaceSlug,
               ownerId: createdUser.id,
               workspaces: {
                  create: {
                     name: `${dto.name}'s workspace`,
                     slug: workspaceSlug,
                     members: {
                        create: {
                           userId: createdUser.id,
                           status: 'ACTIVE',
                           role: 'OWNER',
                           joinedAt: new Date(),
                        },
                     },
                     teams: {
                        create: {
                           name: 'General',
                           identifier: 'GEN',
                           description: 'Default team for this workspace.',
                           members: { create: { userId: createdUser.id, role: 'LEAD' } },
                        },
                     },
                     issueStatuses: {
                        create: [
                           { name: 'Triage', category: 'TRIAGE', color: '#94a3b8', position: 0 },
                           { name: 'Backlog', category: 'BACKLOG', color: '#64748b', position: 1 },
                           { name: 'Todo', category: 'UNSTARTED', color: '#94a3b8', position: 2 },
                           {
                              name: 'In progress',
                              category: 'STARTED',
                              color: '#f59e0b',
                              position: 3,
                           },
                           { name: 'Done', category: 'COMPLETED', color: '#22c55e', position: 4 },
                           {
                              name: 'Canceled',
                              category: 'CANCELED',
                              color: '#ef4444',
                              position: 5,
                           },
                        ],
                     },
                  },
               },
            },
         });

         return { ...createdUser, organization };
      });

      return this.createAuthSession(user, metadata);
   }

   async login(dto: LoginDto, metadata: RequestMetadata): Promise<AuthSession> {
      const user = await this.prisma.user.findUnique({
         where: { email: dto.email },
      });
      if (!user?.passwordHash || user.status !== 'ACTIVE') {
         throw new UnauthorizedException('Invalid email or password.');
      }

      const passwordMatches = await argon2.verify(user.passwordHash, dto.password);
      if (!passwordMatches) {
         throw new UnauthorizedException('Invalid email or password.');
      }

      await this.prisma.user.update({
         where: { id: user.id },
         data: { lastLoginAt: new Date() },
      });

      return this.createAuthSession(user, metadata);
   }

   async refresh(refreshToken: string, metadata: RequestMetadata): Promise<AuthSession> {
      const session = await this.prisma.session.findFirst({
         where: {
            refreshTokenHash: this.hashToken(refreshToken),
            revokedAt: null,
            expiresAt: { gt: new Date() },
         },
         include: { user: true },
      });
      if (!session || session.user.status !== 'ACTIVE') {
         throw new UnauthorizedException('Your session has expired. Please sign in again.');
      }

      await this.prisma.session.update({
         where: { id: session.id },
         data: { revokedAt: new Date(), lastUsedAt: new Date() },
      });
      return this.createAuthSession(session.user, metadata);
   }

   async logout(refreshToken?: string): Promise<void> {
      if (!refreshToken) return;
      await this.prisma.session.updateMany({
         where: { refreshTokenHash: this.hashToken(refreshToken), revokedAt: null },
         data: { revokedAt: new Date() },
      });
   }

   private async createAuthSession(user: User, metadata: RequestMetadata): Promise<AuthSession> {
      const refreshToken = randomBytes(48).toString('base64url');
      await this.prisma.session.create({
         data: {
            userId: user.id,
            refreshTokenHash: this.hashToken(refreshToken),
            ipAddress: metadata.ipAddress,
            userAgent: metadata.userAgent,
            expiresAt: this.refreshExpiryDate(),
         },
      });

      const accessToken = await this.jwt.signAsync(
         { sub: user.id, email: user.email },
         { secret: this.jwtSecret, expiresIn: this.accessTokenTtlSeconds }
      );
      return {
         accessToken,
         refreshToken,
         user: this.toAuthenticatedUser(user),
         workspace: await this.getFirstWorkspace(user.id),
      };
   }

   private async getFirstWorkspace(userId: string): Promise<AuthResponse['workspace']> {
      const membership = await this.prisma.workspaceMember.findFirst({
         where: { userId, status: 'ACTIVE' },
         include: { workspace: true },
         orderBy: { createdAt: 'asc' },
      });
      if (!membership) return null;
      return {
         id: membership.workspace.id,
         slug: membership.workspace.slug,
         name: membership.workspace.name,
      };
   }

   private toAuthenticatedUser(user: User): AuthenticatedUser {
      return {
         id: user.id,
         email: user.email,
         name: user.name,
         username: user.username,
         avatarUrl: user.avatarUrl,
         emailVerified: Boolean(user.emailVerifiedAt),
         isPlatformAdmin: user.isPlatformAdmin,
      };
   }

   private createWorkspaceSlug(name: string): string {
      const normalized = name
         .normalize('NFKD')
         .replace(/[\u0300-\u036f]/g, '')
         .toLowerCase()
         .replace(/[^a-z0-9]+/g, '-')
         .replace(/(^-|-$)/g, '')
         .slice(0, 40);
      return `${normalized || 'workspace'}-${randomBytes(3).toString('hex')}`;
   }

   private hashToken(token: string): string {
      return createHash('sha256').update(token).digest('hex');
   }

   private refreshExpiryDate(): Date {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + this.refreshTokenTtlDays);
      return expiresAt;
   }
}
