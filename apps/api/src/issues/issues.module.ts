import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { IssuesController } from './issues.controller';
import { IssuesService } from './issues.service';

@Module({ imports: [AuthModule], controllers: [IssuesController], providers: [IssuesService] })
export class IssuesModule {}
