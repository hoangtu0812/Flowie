import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';

@Module({
   imports: [JwtModule.register({})],
   controllers: [AuthController],
   providers: [AuthService, AuthGuard],
   exports: [AuthGuard, JwtModule],
})
export class AuthModule {}
