import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { AdminBootstrapService } from './admin-bootstrap.service';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { PlatformAdminGuard } from './platform-admin.guard';

@Module({
   imports: [AuthModule],
   controllers: [AdminController],
   providers: [AdminService, AdminBootstrapService, PlatformAdminGuard],
})
export class AdminModule {}
