import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CyclesController } from './cycles.controller';
import { CyclesService } from './cycles.service';

@Module({ imports: [AuthModule], controllers: [CyclesController], providers: [CyclesService] })
export class CyclesModule {}
