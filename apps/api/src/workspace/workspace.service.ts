import {
   ConflictException,
   ForbiddenException,
   Injectable,
   NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';

@Injectable()
export class WorkspaceService {
   constructor(private readonly prisma: PrismaService) {}

   async listForUser(userId: string) {
      return this.prisma.workspaceMember.findMany({
         where: { userId, status: 'ACTIVE' },
         include: { workspace: { include: { organization: true } } },
         orderBy: { createdAt: 'asc' },
      });
   }

   async members(workspaceId: string, userId: string) {
      const membership = await this.prisma.workspaceMember.findFirst({
         where: { workspaceId, userId, status: 'ACTIVE' },
      });
      if (!membership) throw new NotFoundException('Workspace not found.');
      return this.prisma.workspaceMember.findMany({
         where: { workspaceId },
         include: { user: true },
         orderBy: { createdAt: 'asc' },
      });
   }

   async pendingInvitations(userId: string) {
      return this.prisma.workspaceMember.findMany({
         where: { userId, status: 'INVITED' },
         include: {
            workspace: { include: { organization: true } },
            invitedBy: { select: { id: true, name: true, email: true } },
         },
         orderBy: { createdAt: 'desc' },
      });
   }

   async create(dto: CreateWorkspaceDto, userId: string) {
      const slug = await this.uniqueSlug(dto.name);
      return this.prisma.organization.create({
         data: {
            name: dto.name.trim(),
            slug,
            ownerId: userId,
            workspaces: {
               create: {
                  name: dto.name.trim(),
                  slug,
                  members: {
                     create: { userId, status: 'ACTIVE', role: 'OWNER', joinedAt: new Date() },
                  },
                  teams: {
                     create: {
                        name: 'General',
                        identifier: 'GEN',
                        description: 'Default team for this workspace.',
                        members: { create: { userId, role: 'LEAD' } },
                     },
                  },
                  issueStatuses: { create: this.defaultIssueStatuses() },
               },
            },
         },
         include: { workspaces: { include: { members: { include: { user: true } } } } },
      });
   }

   async invite(workspaceId: string, dto: InviteMemberDto, userId: string) {
      await this.authorizeManager(workspaceId, userId);
      const invited = await this.prisma.user.findUnique({
         where: { email: dto.email.trim().toLowerCase() },
      });
      if (!invited)
         throw new NotFoundException(
            'This person needs to register a Flowie account before they can be invited.'
         );
      if (invited.id === userId) throw new ConflictException('You are already in this workspace.');
      const existing = await this.prisma.workspaceMember.findUnique({
         where: { workspaceId_userId: { workspaceId, userId: invited.id } },
      });
      if (existing?.status === 'ACTIVE')
         throw new ConflictException('This person is already a workspace member.');
      return this.prisma.workspaceMember.upsert({
         where: { workspaceId_userId: { workspaceId, userId: invited.id } },
         create: {
            workspaceId,
            userId: invited.id,
            status: 'INVITED',
            role: dto.role === 'OWNER' ? 'MEMBER' : (dto.role ?? 'MEMBER'),
            invitedById: userId,
         },
         update: {
            status: 'INVITED',
            role: dto.role === 'OWNER' ? 'MEMBER' : (dto.role ?? 'MEMBER'),
            invitedById: userId,
            joinedAt: null,
         },
         include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
      });
   }

   async acceptInvitation(memberId: string, userId: string) {
      const invitation = await this.prisma.workspaceMember.findFirst({
         where: { id: memberId, userId, status: 'INVITED' },
      });
      if (!invitation) throw new NotFoundException('Invitation not found.');
      return this.prisma.workspaceMember.update({
         where: { id: memberId },
         data: { status: 'ACTIVE', joinedAt: new Date() },
         include: { workspace: true },
      });
   }

   async declineInvitation(memberId: string, userId: string) {
      const invitation = await this.prisma.workspaceMember.findFirst({
         where: { id: memberId, userId, status: 'INVITED' },
      });
      if (!invitation) throw new NotFoundException('Invitation not found.');
      await this.prisma.workspaceMember.delete({ where: { id: memberId } });
      return { id: memberId, declined: true };
   }

   async updateMember(memberId: string, workspaceId: string, dto: UpdateMemberDto, userId: string) {
      await this.authorizeOwner(workspaceId, userId);
      const member = await this.prisma.workspaceMember.findFirst({
         where: { id: memberId, workspaceId },
      });
      if (!member) throw new NotFoundException('Workspace member not found.');
      if (member.userId === userId || member.role === 'OWNER' || dto.role === 'OWNER')
         throw new ForbiddenException('Workspace ownership cannot be changed here.');
      return this.prisma.workspaceMember.update({
         where: { id: memberId },
         data: { role: dto.role },
         include: { user: true },
      });
   }

   async removeMember(memberId: string, workspaceId: string, userId: string) {
      await this.authorizeManager(workspaceId, userId);
      const member = await this.prisma.workspaceMember.findFirst({
         where: { id: memberId, workspaceId },
      });
      if (!member) throw new NotFoundException('Workspace member not found.');
      if (member.userId === userId || member.role === 'OWNER')
         throw new ForbiddenException('The workspace owner cannot be removed.');
      await this.prisma.$transaction([
         this.prisma.teamMember.deleteMany({
            where: { userId: member.userId, team: { workspaceId } },
         }),
         this.prisma.workspaceMember.delete({ where: { id: memberId } }),
      ]);
      return { id: memberId, removed: true };
   }

   private async authorizeManager(workspaceId: string, userId: string) {
      const membership = await this.prisma.workspaceMember.findFirst({
         where: { workspaceId, userId, status: 'ACTIVE', role: { in: ['OWNER', 'ADMIN'] } },
      });
      if (!membership) throw new ForbiddenException('Workspace administrator access is required.');
   }

   private async authorizeOwner(workspaceId: string, userId: string) {
      const membership = await this.prisma.workspaceMember.findFirst({
         where: { workspaceId, userId, status: 'ACTIVE', role: 'OWNER' },
      });
      if (!membership) throw new ForbiddenException('Workspace owner access is required.');
   }

   private async uniqueSlug(name: string) {
      const base =
         name
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '')
            .slice(0, 42) || 'workspace';
      let slug = base;
      let suffix = 2;
      while (await this.prisma.workspace.findUnique({ where: { slug } }))
         slug = `${base}-${suffix++}`;
      return slug;
   }

   private defaultIssueStatuses() {
      return [
         { name: 'Triage', category: 'TRIAGE' as const, color: '#94a3b8', position: 0 },
         { name: 'Backlog', category: 'BACKLOG' as const, color: '#64748b', position: 1 },
         { name: 'Todo', category: 'UNSTARTED' as const, color: '#94a3b8', position: 2 },
         { name: 'In progress', category: 'STARTED' as const, color: '#f59e0b', position: 3 },
         { name: 'Done', category: 'COMPLETED' as const, color: '#22c55e', position: 4 },
         { name: 'Canceled', category: 'CANCELED' as const, color: '#ef4444', position: 5 },
      ];
   }
}
