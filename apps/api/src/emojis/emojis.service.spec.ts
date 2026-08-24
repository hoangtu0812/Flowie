import { BadRequestException } from '@nestjs/common';
import { EmojisService } from './emojis.service';

describe('EmojisService', () => {
   const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);

   it('stores validated image bytes and persists workspace metadata', async () => {
      const emoji = {
         id: 'emoji-1',
         workspaceId: 'workspace-1',
         name: 'ship_it',
         filename: 'ship_it.png',
         mimeType: 'image/png',
         size: png.length,
      };
      const prisma = {
         workspaceMember: { findFirst: jest.fn().mockResolvedValue({ id: 'member-1' }) },
         workspaceEmoji: {
            findUnique: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockResolvedValue(emoji),
         },
      };
      const storage = { put: jest.fn().mockResolvedValue(undefined) };
      const audit = { record: jest.fn().mockResolvedValue(undefined) };
      const service = new EmojisService(prisma as never, storage as never, audit as never);

      const result = await service.create(
         { workspaceId: 'workspace-1', name: 'ship_it' },
         { originalname: 'ship.png', mimetype: 'image/png', size: png.length, buffer: png },
         'user-1'
      );

      expect(result).toEqual(emoji);
      expect(storage.put).toHaveBeenCalledWith(expect.stringContaining('/emojis/'), png);
      expect(prisma.workspaceEmoji.create).toHaveBeenCalledWith(
         expect.objectContaining({
            data: expect.objectContaining({ name: 'ship_it', mimeType: 'image/png' }),
         })
      );
      expect(audit.record).toHaveBeenCalledWith(
         expect.objectContaining({ action: 'workspace-emoji.uploaded', entityId: 'emoji-1' })
      );
   });

   it('rejects files whose bytes are not a supported image', async () => {
      const prisma = {
         workspaceMember: { findFirst: jest.fn().mockResolvedValue({ id: 'member-1' }) },
      };
      const service = new EmojisService(
         prisma as never,
         { put: jest.fn() } as never,
         { record: jest.fn() } as never
      );

      await expect(
         service.create(
            { workspaceId: 'workspace-1', name: 'unsafe' },
            {
               originalname: 'unsafe.png',
               mimetype: 'image/png',
               size: 7,
               buffer: Buffer.from('<script'),
            },
            'user-1'
         )
      ).rejects.toBeInstanceOf(BadRequestException);
   });
});
