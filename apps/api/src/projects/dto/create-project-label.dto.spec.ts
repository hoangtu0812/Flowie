import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateProjectLabelDto } from './create-project-label.dto';

describe('CreateProjectLabelDto', () => {
   it('accepts a workspace-scoped Project label', async () => {
      const errors = await validate(
         plainToInstance(CreateProjectLabelDto, {
            workspaceId: 'workspace-id',
            name: 'External dependency',
            color: '#6366f1',
         })
      );

      expect(errors).toHaveLength(0);
   });

   it('rejects an invalid Project label color', async () => {
      const errors = await validate(
         plainToInstance(CreateProjectLabelDto, {
            workspaceId: 'workspace-id',
            name: 'External dependency',
            color: 'violet',
         })
      );

      expect(errors.some((error) => error.property === 'color')).toBe(true);
   });
});
