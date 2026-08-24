import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateProjectUpdateDto } from './create-project-update.dto';

describe('CreateProjectUpdateDto', () => {
   it('accepts a workspace-scoped project update', async () => {
      const errors = await validate(
         plainToInstance(CreateProjectUpdateDto, {
            workspaceId: 'workspace-id',
            body: 'Deployment is on track.',
         })
      );

      expect(errors).toHaveLength(0);
   });

   it.each(['', 'x'.repeat(4001)])('rejects an invalid update body', async (body) => {
      const errors = await validate(
         plainToInstance(CreateProjectUpdateDto, { workspaceId: 'workspace-id', body })
      );

      expect(errors.some((error) => error.property === 'body')).toBe(true);
   });
});
