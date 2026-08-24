import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateAttachmentDto } from './create-attachment.dto';

describe('CreateAttachmentDto', () => {
   it('accepts a project update attachment target', async () => {
      const dto = plainToInstance(CreateAttachmentDto, {
         workspaceId: 'workspace-1',
         entityType: 'project-update',
         entityId: 'update-1',
      });

      await expect(validate(dto)).resolves.toHaveLength(0);
   });

   it('rejects an unsupported attachment target', async () => {
      const dto = plainToInstance(CreateAttachmentDto, {
         workspaceId: 'workspace-1',
         entityType: 'unknown',
         entityId: 'record-1',
      });

      await expect(validate(dto)).resolves.not.toHaveLength(0);
   });
});
