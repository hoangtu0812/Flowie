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
import { WorkspaceModule } from './workspace/workspace.module';

@Module({
   imports: [
      ConfigModule.forRoot({ isGlobal: true }),
      DatabaseModule,
      HealthModule,
      AuthModule,
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
   ],
})
export class AppModule {}
