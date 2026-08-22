import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AuthModule } from './auth/auth.module';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';

@Module({
   imports: [ConfigModule.forRoot({ isGlobal: true }), DatabaseModule, HealthModule, AuthModule],
})
export class AppModule {}
