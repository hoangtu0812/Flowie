import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { IssuesController } from './issues.controller';
import { IssuesService } from './issues.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { SlasModule } from '../slas/slas.module';

@Module({
   imports: [AuthModule, NotificationsModule, SlasModule],
   controllers: [IssuesController],
   providers: [IssuesService],
})
export class IssuesModule {}
