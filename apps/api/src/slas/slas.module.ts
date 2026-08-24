import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { SlasController } from './slas.controller';
import { SlasService } from './slas.service';

@Module({
   imports: [AuthModule, AuditModule],
   controllers: [SlasController],
   providers: [SlasService],
   exports: [SlasService],
})
export class SlasModule {}
