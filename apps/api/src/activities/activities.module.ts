import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ActivitiesController } from './activities.controller';
import { ActivitiesService } from './activities.service';

@Module({
   imports: [AuthModule],
   controllers: [ActivitiesController],
   providers: [ActivitiesService],
})
export class ActivitiesModule {}
