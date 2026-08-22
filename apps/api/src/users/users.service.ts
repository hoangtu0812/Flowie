import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

const profile = {
   id: true,
   name: true,
   email: true,
   username: true,
   title: true,
   avatarUrl: true,
   createdAt: true,
} as const;
type Profile = {
   id: string;
   name: string;
   email: string;
   username: string | null;
   title: string | null;
   avatarUrl: string | null;
   createdAt: Date;
};

@Injectable()
export class UsersService {
   constructor(private readonly prisma: PrismaService) {}

   me(userId: string): Promise<Profile> {
      return this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: profile });
   }

   async list(workspaceId: string, userId: string) {
      await this.authorize(workspaceId, userId);
      const members = await this.prisma.workspaceMember.findMany({
         where: { workspaceId, status: 'ACTIVE' },
         include: {
            user: {
               select: {
                  ...profile,
                  teamMemberships: {
                     where: { team: { workspaceId, archivedAt: null } },
                     select: {
                        role: true,
                        team: { select: { id: true, name: true, identifier: true, icon: true } },
                     },
                  },
               },
            },
         },
         orderBy: { joinedAt: 'asc' },
      });
      return members.map((member) => this.toWorkspaceMember(member));
   }

   async get(targetUserId: string, workspaceId: string, userId: string) {
      await this.authorize(workspaceId, userId);
      const member = await this.prisma.workspaceMember.findFirst({
         where: { workspaceId, userId: targetUserId, status: 'ACTIVE' },
         include: {
            user: {
               select: {
                  ...profile,
                  teamMemberships: {
                     where: { team: { workspaceId, archivedAt: null } },
                     select: {
                        role: true,
                        team: { select: { id: true, name: true, identifier: true, icon: true } },
                     },
                  },
               },
            },
         },
      });
      if (!member) throw new NotFoundException('Member not found.');
      return this.toWorkspaceMember(member);
   }

   updateProfile(userId: string, dto: UpdateProfileDto): Promise<Profile> {
      return this.prisma.user.update({
         where: { id: userId },
         data: {
            ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
            ...(dto.username !== undefined ? { username: dto.username.trim() || null } : {}),
            ...(dto.title !== undefined ? { title: dto.title.trim() || null } : {}),
            ...(dto.avatarUrl !== undefined ? { avatarUrl: dto.avatarUrl.trim() || null } : {}),
         },
         select: profile,
      });
   }

   private async authorize(workspaceId: string, userId: string) {
      const membership = await this.prisma.workspaceMember.findFirst({
         where: { workspaceId, userId, status: 'ACTIVE' },
      });
      if (!membership) throw new ForbiddenException('You do not have access to this workspace.');
   }

   private toWorkspaceMember(member: {
      role: string;
      joinedAt: Date | null;
      createdAt: Date;
      user: Profile & {
         teamMemberships: Array<{
            role: string;
            team: { id: string; name: string; identifier: string; icon: string | null };
         }>;
      };
   }) {
      return {
         ...member.user,
         workspaceRole: member.role,
         joinedAt: member.joinedAt ?? member.createdAt,
         teams: member.user.teamMemberships.map((membership) => ({
            ...membership.team,
            role: membership.role,
         })),
      };
   }
}
