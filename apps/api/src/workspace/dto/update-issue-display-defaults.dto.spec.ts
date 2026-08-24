import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateIssueDisplayDefaultsDto } from './update-issue-display-defaults.dto';

const validDefaults = {
   viewType: 'list',
   grouping: 'status',
   ordering: 'priority',
   orderCompletedByRecency: false,
   completedIssues: 'all',
   showSubIssues: true,
   showEmptyGroups: false,
   displayProperties: {
      id: true,
      status: true,
      priority: true,
      assignee: true,
      labels: true,
      project: true,
      dueDate: false,
      created: true,
      cycle: false,
   },
};

describe('UpdateIssueDisplayDefaultsDto', () => {
   it('accepts a complete issue display configuration', async () => {
      const dto = plainToInstance(UpdateIssueDisplayDefaultsDto, validDefaults);

      await expect(validate(dto)).resolves.toHaveLength(0);
   });

   it('rejects unsupported grouping and non-boolean display properties', async () => {
      const dto = plainToInstance(UpdateIssueDisplayDefaultsDto, {
         ...validDefaults,
         grouping: 'team',
         displayProperties: { ...validDefaults.displayProperties, cycle: 'yes' },
      });
      const errors = await validate(dto);

      expect(errors.some((error) => error.property === 'grouping')).toBe(true);
      expect(errors.some((error) => error.property === 'displayProperties')).toBe(true);
   });
});
