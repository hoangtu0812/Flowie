import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

import { PrismaService } from '../database/prisma.service';
import type { AuthenticatedRequest } from '../auth/auth.guard';

@Injectable()
export class PlatformAdminGuard implements CanActivate {
   constructor(private readonly prisma: PrismaService) {}

   async canActivate(context: ExecutionContext): Promise<boolean> {
      const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
      const user = await this.prisma.user.findUnique({
         where: { id: request.auth!.userId },
         select: { isPlatformAdmin: true, status: true },
      });
      if (!user?.isPlatformAdmin || user.status !== 'ACTIVE') {
         throw new ForbiddenException('Platform administrator access is required.');
      }
      return true;
   }
}
