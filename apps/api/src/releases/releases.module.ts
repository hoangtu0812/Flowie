import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { ReleasesController } from './releases.controller';
import { ReleasesService } from './releases.service';

@Module({
   imports: [AuthModule, AuditModule],
   controllers: [ReleasesController],
   providers: [ReleasesService],
})
export class ReleasesModule {}
