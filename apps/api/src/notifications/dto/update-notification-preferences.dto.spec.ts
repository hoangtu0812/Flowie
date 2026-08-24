import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateNotificationPreferencesDto } from './update-notification-preferences.dto';

describe('UpdateNotificationPreferencesDto', () => {
   it('accepts the complete set exposed by the original notification popover', async () => {
      const dto = plainToInstance(UpdateNotificationPreferencesDto, {
         teamIssueAdded: true,
         issueCompleted: false,
         issueAddedToTriage: true,
      });

      await expect(validate(dto)).resolves.toHaveLength(0);
   });

   it('rejects partial and non-boolean preferences', async () => {
      const dto = plainToInstance(UpdateNotificationPreferencesDto, {
         teamIssueAdded: 'yes',
         issueCompleted: false,
      });
      const errors = await validate(dto);

      expect(errors.map(({ property }) => property).sort()).toEqual([
         'issueAddedToTriage',
         'teamIssueAdded',
      ]);
   });
});
