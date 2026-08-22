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
});
