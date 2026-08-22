import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AuthModule } from './auth/auth.module';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { WorkspaceModule } from './workspace/workspace.module';

@Module({
   imports: [
      ConfigModule.forRoot({ isGlobal: true }),
      DatabaseModule,
      HealthModule,
      AuthModule,
      WorkspaceModule,
   ],
})
export class AppModule {}
