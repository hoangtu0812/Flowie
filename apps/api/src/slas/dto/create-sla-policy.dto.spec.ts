import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateSlaPolicyDto } from './create-sla-policy.dto';

describe('CreateSlaPolicyDto', () => {
   it('accepts a scoped issue deadline policy', async () => {
      const dto = plainToInstance(CreateSlaPolicyDto, {
         workspaceId: 'workspace-1',
         name: 'Urgent issues',
         teamId: 'team-1',
         priority: 'URGENT',
         deadlineMinutes: 240,
         enabled: true,
      });
      await expect(validate(dto)).resolves.toHaveLength(0);
   });

   it('rejects invalid names, priorities and deadlines', async () => {
      const dto = plainToInstance(CreateSlaPolicyDto, {
         workspaceId: 'workspace-1',
         name: 'x',
         priority: 'CRITICAL',
         deadlineMinutes: 5,
      });
      const fields = (await validate(dto)).map((error) => error.property);
      expect(fields).toEqual(expect.arrayContaining(['name', 'priority', 'deadlineMinutes']));
   });
});
