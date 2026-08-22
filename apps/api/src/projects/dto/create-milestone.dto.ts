import { Type } from 'class-transformer';
import {
   IsDateString,
   IsInt,
   IsOptional,
   IsString,
   MaxLength,
   Min,
   MinLength,
} from 'class-validator';

export class CreateMilestoneDto {
   @IsString() workspaceId!: string;
   @IsString() @MinLength(2) @MaxLength(160) title!: string;
   @IsOptional() @IsString() @MaxLength(2000) description?: string;
   @IsOptional() @IsDateString() targetDate?: string;
   @IsOptional() @Type(() => Number) @IsInt() @Min(0) position?: number;
}
