import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateDocumentDto } from './create-document.dto';
import { CreateDocumentFolderDto } from './create-document-folder.dto';
import { UpdateDocumentDto } from './update-document.dto';

describe('Document DTOs', () => {
   it('accepts folder, icon, pin and position metadata for documents', async () => {
      const createDto = plainToInstance(CreateDocumentDto, {
         workspaceId: 'workspace-1',
         teamId: 'team-1',
         folderId: 'folder-1',
         title: 'Team handbook',
         icon: '📕',
         pinned: true,
         position: 2,
      });
      const updateDto = plainToInstance(UpdateDocumentDto, {
         folderId: 'folder-2',
         pinned: false,
         position: 1,
      });

      await expect(validate(createDto)).resolves.toHaveLength(0);
      await expect(validate(updateDto)).resolves.toHaveLength(0);
   });

   it('rejects invalid document metadata', async () => {
      const dto = plainToInstance(CreateDocumentDto, {
         workspaceId: 'workspace-1',
         title: 'x',
         icon: '',
         pinned: 'yes',
         position: -1,
      });
      const fields = (await validate(dto)).map((error) => error.property);

      expect(fields).toEqual(expect.arrayContaining(['title', 'icon', 'pinned', 'position']));
   });

   it('validates new document folders', async () => {
      const valid = plainToInstance(CreateDocumentFolderDto, {
         workspaceId: 'workspace-1',
         teamId: 'team-1',
         name: 'Design',
         icon: '🎨',
      });
      const invalid = plainToInstance(CreateDocumentFolderDto, {
         workspaceId: 'workspace-1',
         teamId: 'team-1',
         name: 'x',
         icon: '',
      });

      await expect(validate(valid)).resolves.toHaveLength(0);
      expect((await validate(invalid)).map((error) => error.property)).toEqual(
         expect.arrayContaining(['name', 'icon'])
      );
   });
});
