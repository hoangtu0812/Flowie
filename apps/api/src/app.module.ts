import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AuthModule } from './auth/auth.module';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { TeamsModule } from './teams/teams.module';
import { ProjectsModule } from './projects/projects.module';
import { IssuesModule } from './issues/issues.module';
import { CyclesModule } from './cycles/cycles.module';
import { DocumentsModule } from './documents/documents.module';
import { CommentsModule } from './comments/comments.module';
import { ActivitiesModule } from './activities/activities.module';
import { LabelsModule } from './labels/labels.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AttachmentsModule } from './attachments/attachments.module';
import { StorageModule } from './storage/storage.module';
import { WorkspaceModule } from './workspace/workspace.module';
import { AdminModule } from './admin/admin.module';
import { UsersModule } from './users/users.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { PortfolioModule } from './portfolio/portfolio.module';
import { JobsModule } from './jobs/jobs.module';
import { AuditModule } from './audit/audit.module';
import { ReleasesModule } from './releases/releases.module';
import { CustomerRequestsModule } from './customer-requests/customer-requests.module';
import { SlasModule } from './slas/slas.module';

@Module({
   imports: [
      ConfigModule.forRoot({ isGlobal: true }),
      JobsModule,
      AuditModule,
      DatabaseModule,
      HealthModule,
      AuthModule,
      AdminModule,
      UsersModule,
      IntegrationsModule,
      PortfolioModule,
      ReleasesModule,
      CustomerRequestsModule,
      SlasModule,
      WorkspaceModule,
      TeamsModule,
      ProjectsModule,
      IssuesModule,
      CyclesModule,
      DocumentsModule,
      CommentsModule,
      ActivitiesModule,
      LabelsModule,
      NotificationsModule,
      StorageModule,
      AttachmentsModule,
   ],
})
export class AppModule {}
