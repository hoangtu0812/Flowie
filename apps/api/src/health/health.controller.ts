import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { HealthCheckResponse } from '@circle/contracts';

@ApiTags('health')
@Controller('health')
export class HealthController {
   @Get()
   @ApiOkResponse({ description: 'The API process is ready to receive requests.' })
   getHealth(): HealthCheckResponse {
      return {
         status: 'ok',
         service: 'api',
         timestamp: new Date().toISOString(),
      };
   }
}
