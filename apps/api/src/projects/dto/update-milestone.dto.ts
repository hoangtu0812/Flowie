import { Type } from 'class-transformer';
import {
   IsBoolean,
   IsDateString,
   IsInt,
   IsOptional,
   IsString,
   MaxLength,
   Min,
   MinLength,
} from 'class-validator';

export class UpdateMilestoneDto {
   @IsOptional() @IsString() @MinLength(2) @MaxLength(160) title?: string;
   @IsOptional() @IsString() @MaxLength(2000) description?: string;
   @IsOptional() @IsDateString() targetDate?: string;
   @IsOptional() @IsBoolean() completed?: boolean;
   @IsOptional() @Type(() => Number) @IsInt() @Min(0) position?: number;
}
