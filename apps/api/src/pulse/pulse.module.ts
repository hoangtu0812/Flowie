import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PulseController } from './pulse.controller';
import { PulseService } from './pulse.service';

@Module({
   imports: [AuthModule],
   controllers: [PulseController],
   providers: [PulseService],
})
export class PulseModule {}
