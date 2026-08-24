import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateTeamDto } from './update-team.dto';

describe('UpdateTeamDto', () => {
   it('accepts persisted team workflow settings', async () => {
      const dto = plainToInstance(UpdateTeamDto, {
         triageEnabled: false,
         cycleCadenceWeeks: 2,
         autoCloseDays: 30,
         autoArchiveDays: 90,
         parentTeamId: 'parent-team',
         defaultIssueTemplateId: 'template-1',
      });

      await expect(validate(dto)).resolves.toHaveLength(0);
   });

   it('rejects an unsupported cycle cadence', async () => {
      const dto = plainToInstance(UpdateTeamDto, { cycleCadenceWeeks: 13 });

      await expect(validate(dto)).resolves.not.toHaveLength(0);
   });
});
