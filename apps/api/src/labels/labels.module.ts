import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LabelsController } from './labels.controller';
import { LabelsService } from './labels.service';

@Module({ imports: [AuthModule], controllers: [LabelsController], providers: [LabelsService] })
export class LabelsModule {}
