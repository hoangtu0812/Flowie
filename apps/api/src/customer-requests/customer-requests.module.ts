import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { CustomerRequestsController } from './customer-requests.controller';
import { CustomerRequestsService } from './customer-requests.service';

@Module({
   imports: [AuthModule, AuditModule],
   controllers: [CustomerRequestsController],
   providers: [CustomerRequestsService],
})
export class CustomerRequestsModule {}
