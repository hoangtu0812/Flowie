import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateCustomerRequestDto } from './create-customer-request.dto';

describe('CreateCustomerRequestDto', () => {
   it('accepts a request linked to project work', async () => {
      const dto = plainToInstance(CreateCustomerRequestDto, {
         workspaceId: 'workspace-1',
         title: 'Add an approval workflow',
         customer: 'Operations team',
         source: 'interview',
         status: 'planned',
         priority: 'high',
         projectId: 'project-1',
         issueId: 'issue-1',
      });
      await expect(validate(dto)).resolves.toHaveLength(0);
   });

   it('rejects unsupported workflow values', async () => {
      const dto = plainToInstance(CreateCustomerRequestDto, {
         workspaceId: 'workspace-1',
         title: 'x',
         customer: '',
         source: 'email',
         status: 'shipped',
         priority: 'critical',
      });
      const fields = (await validate(dto)).map((error) => error.property);
      expect(fields).toEqual(
         expect.arrayContaining(['title', 'customer', 'source', 'status', 'priority'])
      );
   });
});
