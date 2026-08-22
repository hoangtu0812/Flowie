import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { NotificationsModule } from '../notifications/notifications.module';
@Module({
   imports: [AuthModule, NotificationsModule],
   controllers: [ProjectsController],
   providers: [ProjectsService],
})
export class ProjectsModule {}
