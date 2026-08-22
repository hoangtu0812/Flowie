import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { IntegrationsModule } from '../integrations/integrations.module';
@Module({ imports: [AuthModule, IntegrationsModule], controllers: [ProjectsController], providers: [ProjectsService] })
export class ProjectsModule {}
