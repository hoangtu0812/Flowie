import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateProjectDto } from './update-project.dto';

describe('UpdateProjectDto targetDate', () => {
   it.each([new Date().toISOString(), null])('accepts a persisted target date value', async (targetDate) => {
      const errors = await validate(plainToInstance(UpdateProjectDto, { targetDate }));

      expect(errors).toHaveLength(0);
   });

   it('rejects an invalid target date', async () => {
      const errors = await validate(
         plainToInstance(UpdateProjectDto, { targetDate: 'not-a-datetime' })
      );

      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('targetDate');
   });
});
