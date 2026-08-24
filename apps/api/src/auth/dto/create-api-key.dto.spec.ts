import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateApiKeyDto } from './create-api-key.dto';

describe('CreateApiKeyDto', () => {
   it('accepts a named key with an optional expiry', async () => {
      const dto = plainToInstance(CreateApiKeyDto, {
         name: 'Reporting integration',
         expiresAt: '2027-01-01T00:00:00.000Z',
      });
      await expect(validate(dto)).resolves.toHaveLength(0);
   });

   it('rejects an invalid expiry date', async () => {
      const dto = plainToInstance(CreateApiKeyDto, { name: 'Reporting', expiresAt: 'tomorrow' });
      await expect(validate(dto)).resolves.not.toHaveLength(0);
   });
});
