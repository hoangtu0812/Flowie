import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { DocumentsService } from './documents.service';

const activeMembership = { id: 'workspace-member-1' };
const activeTeam = { id: 'team-1' };

describe('DocumentsService folders', () => {
   it('requires a team scope for the folder tree', async () => {
      const prisma = {
         workspaceMember: { findFirst: jest.fn() },
         documentFolder: { findMany: jest.fn() },
      };
      const service = new DocumentsService(prisma as never);

      await expect(service.listFolders('workspace-1', '', 'user-1')).rejects.toBeInstanceOf(
         BadRequestException
      );
      expect(prisma.workspaceMember.findFirst).not.toHaveBeenCalled();
      expect(prisma.documentFolder.findMany).not.toHaveBeenCalled();
   });

   it('returns ordered folders with active documents after team authorization', async () => {
      const folders = [{ id: 'folder-1', documents: [{ id: 'document-1' }] }];
      const prisma = {
         workspaceMember: { findFirst: jest.fn().mockResolvedValue(activeMembership) },
         team: { findFirst: jest.fn().mockResolvedValue(activeTeam) },
         documentFolder: { findMany: jest.fn().mockResolvedValue(folders) },
      };
      const service = new DocumentsService(prisma as never);

      await expect(service.listFolders('workspace-1', 'team-1', 'user-1')).resolves.toEqual(
         folders
      );
      expect(prisma.documentFolder.findMany).toHaveBeenCalledWith(
         expect.objectContaining({
            where: { workspaceId: 'workspace-1', teamId: 'team-1' },
            include: expect.objectContaining({
               documents: expect.objectContaining({ where: { archivedAt: null } }),
            }),
         })
      );
   });

   it('rejects folder reads for a user outside the team', async () => {
      const prisma = {
         workspaceMember: { findFirst: jest.fn().mockResolvedValue(activeMembership) },
         team: { findFirst: jest.fn().mockResolvedValue(null) },
         documentFolder: { findMany: jest.fn() },
      };
      const service = new DocumentsService(prisma as never);

      await expect(service.listFolders('workspace-1', 'team-1', 'user-1')).rejects.toBeInstanceOf(
         ForbiddenException
      );
      expect(prisma.documentFolder.findMany).not.toHaveBeenCalled();
   });

   it('creates a document in the team default folder with the next stable position', async () => {
      const folder = { id: 'folder-1', workspaceId: 'workspace-1', teamId: 'team-1' };
      const created = { id: 'document-1', folderId: folder.id, position: 3 };
      const prisma = {
         workspaceMember: { findFirst: jest.fn().mockResolvedValue(activeMembership) },
         team: { findFirst: jest.fn().mockResolvedValue(activeTeam) },
         documentFolder: { findFirst: jest.fn().mockResolvedValue(folder) },
         document: {
            aggregate: jest.fn().mockResolvedValue({ _max: { position: 2 } }),
            create: jest.fn().mockResolvedValue(created),
         },
      };
      const service = new DocumentsService(prisma as never);

      await expect(
         service.create(
            { workspaceId: 'workspace-1', teamId: 'team-1', title: ' Team handbook ' },
            'user-1'
         )
      ).resolves.toEqual(created);
      expect(prisma.document.create).toHaveBeenCalledWith(
         expect.objectContaining({
            data: expect.objectContaining({
               folderId: 'folder-1',
               position: 3,
               title: 'Team handbook',
            }),
         })
      );
   });

   it('does not allow a team document to use a folder from another team', async () => {
      const prisma = {
         workspaceMember: { findFirst: jest.fn().mockResolvedValue(activeMembership) },
         team: { findFirst: jest.fn().mockResolvedValue(activeTeam) },
         documentFolder: { findFirst: jest.fn().mockResolvedValue(null) },
         document: { create: jest.fn() },
      };
      const service = new DocumentsService(prisma as never);

      await expect(
         service.create(
            {
               workspaceId: 'workspace-1',
               teamId: 'team-1',
               folderId: 'other-team-folder',
               title: 'Team handbook',
            },
            'user-1'
         )
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.document.create).not.toHaveBeenCalled();
   });

   it('does not allow workspace documents to use team folders', async () => {
      const prisma = {
         workspaceMember: { findFirst: jest.fn().mockResolvedValue(activeMembership) },
         document: { create: jest.fn() },
      };
      const service = new DocumentsService(prisma as never);

      await expect(
         service.create(
            { workspaceId: 'workspace-1', folderId: 'folder-1', title: 'Workspace handbook' },
            'user-1'
         )
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.document.create).not.toHaveBeenCalled();
   });

   it('persists pin changes without changing the document folder', async () => {
      const document = { id: 'document-1', teamId: 'team-1', folderId: 'folder-1' };
      const updated = { ...document, pinned: true };
      const prisma = {
         workspaceMember: { findFirst: jest.fn().mockResolvedValue(activeMembership) },
         team: { findFirst: jest.fn().mockResolvedValue(activeTeam) },
         document: {
            findFirst: jest.fn().mockResolvedValue(document),
            update: jest.fn().mockResolvedValue(updated),
         },
      };
      const service = new DocumentsService(prisma as never);

      await expect(
         service.update('document-1', 'workspace-1', { pinned: true }, 'user-1')
      ).resolves.toEqual(updated);
      expect(prisma.document.update).toHaveBeenCalledWith(
         expect.objectContaining({ data: expect.objectContaining({ pinned: true }) })
      );
   });
});
