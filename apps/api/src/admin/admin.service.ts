import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { UserStatus } from '@circle/database';

import { PrismaService } from '../database/prisma.service';
import { UpdateAdminUserDto } from './dto/update-admin-user.dto';

@Injectable()
export class AdminService {
   constructor(private readonly prisma: PrismaService) {}

   async overview() {
      const [users, activeUsers, organizations, workspaces, projects, issues] = await this.prisma.$transaction([
         this.prisma.user.count(),
         this.prisma.user.count({ where: { status: 'ACTIVE' } }),
         this.prisma.organization.count(),
         this.prisma.workspace.count(),
         this.prisma.project.count(),
         this.prisma.issue.count(),
      ]);
      return { users, activeUsers, organizations, workspaces, projects, issues };
   }

   async users() {
      return this.prisma.user.findMany({
         select: {
            id: true,
            name: true,
            email: true,
            status: true,
            isPlatformAdmin: true,
            createdAt: true,
            lastLoginAt: true,
            _count: { select: { memberships: true, organizations: true } },
         },
         orderBy: { createdAt: 'desc' },
      });
   }

   async workspaces() {
      return this.prisma.workspace.findMany({
         select: {
            id: true,
            name: true,
            slug: true,
            createdAt: true,
            organization: { select: { name: true, slug: true, owner: { select: { name: true, email: true } } } },
            _count: { select: { members: true, teams: true, projects: true, issues: true } },
         },
         orderBy: { createdAt: 'desc' },
      });
   }

   async updateUser(actorId: string, userId: string, dto: UpdateAdminUserDto) {
      if (actorId === userId) {
         throw new BadRequestException('Use a separate platform administrator to change your own access.');
      }
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!user) throw new NotFoundException('User not found.');

      if (dto.isPlatformAdmin === false && user.isPlatformAdmin) {
         const remainingAdmins = await this.prisma.user.count({ where: { isPlatformAdmin: true } });
         if (remainingAdmins <= 1) {
            throw new BadRequestException('The final platform administrator cannot be demoted.');
         }
      }
      if (dto.status && dto.status !== UserStatus.ACTIVE && user.isPlatformAdmin) {
         throw new BadRequestException('Demote this platform administrator before changing their status.');
      }

      const updated = await this.prisma.user.update({
         where: { id: userId },
         data: {
            ...(dto.status ? { status: dto.status } : {}),
            ...(dto.isPlatformAdmin !== undefined ? { isPlatformAdmin: dto.isPlatformAdmin } : {}),
         },
         select: {
            id: true,
            name: true,
            email: true,
            status: true,
            isPlatformAdmin: true,
            createdAt: true,
            lastLoginAt: true,
            _count: { select: { memberships: true, organizations: true } },
         },
      });

      if (dto.status && dto.status !== UserStatus.ACTIVE) {
         await this.prisma.session.updateMany({
            where: { userId, revokedAt: null },
            data: { revokedAt: new Date() },
         });
      }
      return updated;
   }
}
