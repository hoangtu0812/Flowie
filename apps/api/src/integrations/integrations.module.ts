import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { IntegrationsController } from './integrations.controller';
import { IntegrationsService } from './integrations.service';
@Module({ imports: [AuthModule], controllers: [IntegrationsController], providers: [IntegrationsService], exports: [IntegrationsService] })
export class IntegrationsModule {}
