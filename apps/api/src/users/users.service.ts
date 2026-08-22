import { Injectable } from '@nestjs/common';
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
}
