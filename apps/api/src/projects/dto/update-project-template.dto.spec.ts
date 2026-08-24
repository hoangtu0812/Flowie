import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateProjectTemplateDto } from './update-project-template.dto';

describe('UpdateProjectTemplateDto', () => {
   it('accepts editable template fields', async () => {
      const dto = plainToInstance(UpdateProjectTemplateDto, {
         name: 'Launch plan',
         description: 'Reusable launch workflow',
         config: { health: 'on-track' },
      });
      await expect(validate(dto)).resolves.toHaveLength(0);
   });

   it('rejects a one-character template name', async () => {
      const dto = plainToInstance(UpdateProjectTemplateDto, { name: 'x' });
      expect(await validate(dto)).toHaveLength(1);
   });
});
