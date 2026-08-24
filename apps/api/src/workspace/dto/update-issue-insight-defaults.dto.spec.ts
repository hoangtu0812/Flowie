import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateIssueInsightDefaultsDto } from './update-issue-insight-defaults.dto';

describe('UpdateIssueInsightDefaultsDto', () => {
   it('accepts the insight configuration exposed by the original selectors', async () => {
      const dto = plainToInstance(UpdateIssueInsightDefaultsDto, {
         measure: 'issue-count',
         slice: 'status',
         segment: 'priority',
      });

      await expect(validate(dto)).resolves.toHaveLength(0);
   });

   it('rejects unsupported insight dimensions', async () => {
      const dto = plainToInstance(UpdateIssueInsightDefaultsDto, {
         measure: 'estimate',
         slice: 'assignee',
         segment: 'project',
      });
      const errors = await validate(dto);

      expect(errors.map(({ property }) => property).sort()).toEqual([
         'measure',
         'segment',
         'slice',
      ]);
   });
});
