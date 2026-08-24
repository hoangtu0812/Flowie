import { ForbiddenException } from '@nestjs/common';
import { AttachmentsService, type UploadedFile } from './attachments.service';

describe('AttachmentsService archived team access', () => {
   function createService() {
      const prisma = {
         issue: {
            findFirst: jest.fn().mockResolvedValue({ teamId: 'team-1' }),
         },
         workspaceMember: {
            findFirst: jest.fn().mockResolvedValue({ id: 'workspace-member-1' }),
         },
         team: {
            // An archived team does not match the active-team guard.
            findFirst: jest.fn().mockResolvedValue(null),
         },
         attachment: {
            findMany: jest.fn(),
            create: jest.fn(),
         },
      };
      const storage = {
         put: jest.fn(),
         get: jest.fn(),
      };
      return {
         service: new AttachmentsService(prisma as never, storage as never),
         prisma,
         storage,
      };
   }

   it('does not list attachments for an entity in an archived team', async () => {
      const { service, prisma } = createService();

      await expect(
         service.list('workspace-1', 'issue', 'issue-1', 'user-1')
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.team.findFirst).toHaveBeenCalledWith({
         where: {
            id: 'team-1',
            workspaceId: 'workspace-1',
            archivedAt: null,
            members: { some: { userId: 'user-1' } },
         },
      });
      expect(prisma.attachment.findMany).not.toHaveBeenCalled();
   });

   it('does not upload attachments for an entity in an archived team', async () => {
      const { service, prisma, storage } = createService();
      const file: UploadedFile = {
         originalname: 'blocked.txt',
         mimetype: 'text/plain',
         size: 7,
         buffer: Buffer.from('blocked'),
      };

      await expect(
         service.create(
            {
               workspaceId: 'workspace-1',
               entityType: 'issue',
               entityId: 'issue-1',
            },
            file,
            'user-1'
         )
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(storage.put).not.toHaveBeenCalled();
      expect(prisma.attachment.create).not.toHaveBeenCalled();
   });
});
