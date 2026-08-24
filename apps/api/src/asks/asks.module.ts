import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { IssuesModule } from '../issues/issues.module';
import { AsksController } from './asks.controller';
import { AsksService } from './asks.service';

@Module({
   imports: [AuthModule, AuditModule, IssuesModule],
   controllers: [AsksController],
   providers: [AsksService],
})
export class AsksModule {}
