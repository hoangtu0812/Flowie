import { CycleStatus } from '@circle/database';
import { IsDateString, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateCycleDto {
   @IsString() workspaceId!: string;
   @IsString() teamId!: string;
   @IsString() @MinLength(2) @MaxLength(120) name!: string;
   @IsOptional() @IsString() @MaxLength(2000) description?: string;
   @IsOptional() @IsEnum(CycleStatus) status?: CycleStatus;
   @IsOptional() @IsDateString() startDate?: string;
   @IsOptional() @IsDateString() endDate?: string;
}
