import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateAskDto } from './create-ask.dto';

describe('CreateAskDto', () => {
   it('accepts a request targeting real team work', async () => {
      const dto = plainToInstance(CreateAskDto, {
         workspaceId: 'workspace-1',
         teamId: 'team-1',
         projectId: 'project-1',
         title: 'Prepare the launch checklist',
         priority: 'HIGH',
      });
      await expect(validate(dto)).resolves.toHaveLength(0);
   });

   it('rejects an invalid title and priority', async () => {
      const dto = plainToInstance(CreateAskDto, {
         workspaceId: 'workspace-1',
         teamId: 'team-1',
         title: 'x',
         priority: 'CRITICAL',
      });
      const fields = (await validate(dto)).map((error) => error.property);
      expect(fields).toEqual(expect.arrayContaining(['title', 'priority']));
   });
});
