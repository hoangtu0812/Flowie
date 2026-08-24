import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import { PrismaService } from '../database/prisma.service';
import { AuthService } from './auth.service';

describe('AuthService', () => {
   it('does not reveal whether an email account exists on failed login', async () => {
      const prisma = {
         user: { findUnique: jest.fn().mockResolvedValue(null) },
      } as unknown as PrismaService;
      const service = new AuthService(
         prisma,
         {} as JwtService,
         {
            get: jest.fn().mockImplementation((_key: string, fallback: unknown) => fallback),
         } as unknown as ConfigService
      );

      await expect(
         service.login({ email: 'missing@example.com', password: 'not-a-real-password' }, {})
      ).rejects.toEqual(new UnauthorizedException('Invalid email or password.'));
   });

   it('returns a personal API key only once while persisting its hash', async () => {
      const create = jest.fn().mockImplementation(({ data }) =>
         Promise.resolve({
            id: 'key-1',
            name: data.name,
            prefix: data.prefix,
            expiresAt: data.expiresAt,
            lastUsedAt: null,
            createdAt: new Date(),
         })
      );
      const service = new AuthService(
         { personalApiKey: { create } } as unknown as PrismaService,
         {} as JwtService,
         { get: jest.fn().mockImplementation((_key: string, fallback: unknown) => fallback) } as unknown as ConfigService
      );

      const result = await service.createApiKey('user-1', { name: 'Automation' });

      expect(result.token).toMatch(/^flowie_pat_/);
      expect(create).toHaveBeenCalledWith(
         expect.objectContaining({
            data: expect.objectContaining({
               userId: 'user-1',
               tokenHash: expect.not.stringContaining('flowie_pat_'),
            }),
         })
      );
   });
});
