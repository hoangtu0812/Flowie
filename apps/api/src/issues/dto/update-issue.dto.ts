import { Transform } from 'class-transformer';
import {
   IsArray,
   IsDateString,
   IsEnum,
   IsNumber,
   IsOptional,
   IsString,
   MaxLength,
   Min,
   MinLength,
} from 'class-validator';
import { IssuePriority } from '@circle/database';

export class UpdateIssueDto {
   @IsOptional() @IsString() @MinLength(2) @MaxLength(500) title?: string;
   @IsOptional() @IsString() @MaxLength(10000) description?: string;
   @IsOptional() @IsString() statusId?: string;
   @IsOptional() @IsString() projectId?: string;
   @IsOptional() @IsString() assigneeId?: string;
   @IsOptional() @IsEnum(IssuePriority) priority?: IssuePriority;
   @IsOptional() @IsArray() @IsString({ each: true }) labelIds?: string[];
   @IsOptional() @IsArray() @IsString({ each: true }) releaseIds?: string[];
   @IsOptional() @IsDateString() dueDate?: string | null;
   @IsOptional()
   @Transform(({ value }) => Number(value))
   @IsNumber({ maxDecimalPlaces: 2 })
   @Min(0)
   estimatedEffort?: number;
   @IsOptional()
   @Transform(({ value }) => Number(value))
   @IsNumber({ maxDecimalPlaces: 2 })
   @Min(0)
   actualEffort?: number;
}
