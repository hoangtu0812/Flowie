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

describe('UpdateProjectDto dates and team', () => {
   it.each([new Date().toISOString(), '2026-08-25', null])(
      'accepts a persisted start date value',
      async (startDate) => {
         const errors = await validate(plainToInstance(UpdateProjectDto, { startDate }));

         expect(errors).toHaveLength(0);
      }
   );

   it('rejects an invalid start date', async () => {
      const errors = await validate(
         plainToInstance(UpdateProjectDto, { startDate: 'not-a-date' })
      );

      expect(errors.some((error) => error.property === 'startDate')).toBe(true);
   });

   it.each(['team-1', null])('accepts a nullable team assignment', async (teamId) => {
      const errors = await validate(plainToInstance(UpdateProjectDto, { teamId }));

      expect(errors).toHaveLength(0);
   });

   it('rejects an empty team identifier', async () => {
      const errors = await validate(plainToInstance(UpdateProjectDto, { teamId: '' }));

      expect(errors.some((error) => error.property === 'teamId')).toBe(true);
   });
});

describe('UpdateProjectDto labelIds', () => {
   it('accepts an empty label collection to clear persisted Project labels', async () => {
      const errors = await validate(plainToInstance(UpdateProjectDto, { labelIds: [] }));

      expect(errors).toHaveLength(0);
   });

   it('rejects non-string label identifiers', async () => {
      const errors = await validate(plainToInstance(UpdateProjectDto, { labelIds: ['label', 3] }));

      expect(errors.some((error) => error.property === 'labelIds')).toBe(true);
   });
});
