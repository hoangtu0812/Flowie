import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateIssueDto } from './update-issue.dto';

describe('UpdateIssueDto dueDate', () => {
   it.each([new Date().toISOString(), null])('accepts a persisted due date value', async (dueDate) => {
      const errors = await validate(plainToInstance(UpdateIssueDto, { dueDate }));

      expect(errors).toHaveLength(0);
   });

   it('rejects an invalid due date', async () => {
      const errors = await validate(
         plainToInstance(UpdateIssueDto, { dueDate: 'not-a-datetime' })
      );

      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('dueDate');
   });
});
