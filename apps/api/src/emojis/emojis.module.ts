import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { StorageModule } from '../storage/storage.module';
import { EmojisController } from './emojis.controller';
import { EmojisService } from './emojis.service';

@Module({
   imports: [AuthModule, AuditModule, StorageModule],
   controllers: [EmojisController],
   providers: [EmojisService],
})
export class EmojisModule {}
