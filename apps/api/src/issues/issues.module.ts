import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { IssuesController } from './issues.controller';
import { IssuesService } from './issues.service';
import { IntegrationsModule } from '../integrations/integrations.module';

@Module({ imports: [AuthModule, IntegrationsModule], controllers: [IssuesController], providers: [IssuesService] })
export class IssuesModule {}
