import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateReleaseDto } from './create-release.dto';

describe('CreateReleaseDto', () => {
   it('accepts a persisted workspace release', async () => {
      const dto = plainToInstance(CreateReleaseDto, {
         workspaceId: 'workspace-1',
         name: 'Autumn launch',
         version: '2026.08',
         status: 'in-progress',
         targetDate: '2026-08-31',
         projectIds: ['project-1', 'project-2'],
      });

      await expect(validate(dto)).resolves.toHaveLength(0);
   });

   it('rejects an invalid name, version and status', async () => {
      const dto = plainToInstance(CreateReleaseDto, {
         workspaceId: 'workspace-1',
         name: 'x',
         version: '',
         status: 'shipping',
      });

      const fields = (await validate(dto)).map((error) => error.property);
      expect(fields).toEqual(expect.arrayContaining(['name', 'version', 'status']));
   });
});
