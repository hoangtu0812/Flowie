import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthGuard, type AuthenticatedRequest } from './auth.guard';

const contextFor = (request: AuthenticatedRequest) =>
   ({ switchToHttp: () => ({ getRequest: () => request }) }) as never;

describe('AuthGuard personal API keys', () => {
   it('authenticates an active hashed personal API key', async () => {
      const request = { headers: { authorization: 'Bearer flowie_pat_secret' } } as AuthenticatedRequest;
      const prisma = {
         personalApiKey: {
            findFirst: jest.fn().mockResolvedValue({ id: 'key-1', userId: 'user-1', lastUsedAt: new Date() }),
            update: jest.fn(),
         },
      };
      const guard = new AuthGuard({} as JwtService, {} as ConfigService, prisma as never);

      await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
      expect(request.auth).toEqual({ userId: 'user-1' });
      expect(prisma.personalApiKey.findFirst).toHaveBeenCalledWith(
         expect.objectContaining({ where: expect.objectContaining({ tokenHash: expect.any(String) }) })
      );
   });

   it('rejects an unknown personal API key', async () => {
      const request = { headers: { authorization: 'Bearer flowie_pat_unknown' } } as AuthenticatedRequest;
      const prisma = { personalApiKey: { findFirst: jest.fn().mockResolvedValue(null) } };
      const guard = new AuthGuard({} as JwtService, {} as ConfigService, prisma as never);

      await expect(guard.canActivate(contextFor(request))).rejects.toThrow('invalid or expired');
   });
});
