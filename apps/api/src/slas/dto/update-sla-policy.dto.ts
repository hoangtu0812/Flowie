import { Transform } from 'class-transformer';
import { IssuePriority } from '@circle/database';
import {
   IsBoolean,
   IsEnum,
   IsInt,
   IsOptional,
   IsString,
   Max,
   MaxLength,
   Min,
   MinLength,
} from 'class-validator';

export class UpdateSlaPolicyDto {
   @IsOptional() @IsString() @MinLength(2) @MaxLength(160) name?: string;
   @IsOptional() @IsString() @MaxLength(2000) description?: string | null;
   @IsOptional() @IsString() teamId?: string | null;
   @IsOptional() @IsEnum(IssuePriority) priority?: IssuePriority | null;
   @IsOptional() @Transform(({ value }) => Number(value)) @IsInt() @Min(15) @Max(525600)
   deadlineMinutes?: number;
   @IsOptional() @IsBoolean() enabled?: boolean;
}
