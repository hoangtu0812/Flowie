import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateProjectStatusDto } from './create-project-status.dto';

describe('CreateProjectStatusDto', () => {
   it('accepts a valid workspace project status', async () => {
      const dto = plainToInstance(CreateProjectStatusDto, {
         workspaceId: 'workspace-id',
         name: 'Technical review',
         category: 'in-progress',
         color: '#5e6ad2',
         position: 2,
      });
      await expect(validate(dto)).resolves.toHaveLength(0);
   });

   it('rejects unsupported categories and invalid colors', async () => {
      const dto = plainToInstance(CreateProjectStatusDto, {
         workspaceId: 'workspace-id',
         name: 'Review',
         category: 'unknown',
         color: 'blue',
      });
      expect(await validate(dto)).toHaveLength(2);
   });
});
