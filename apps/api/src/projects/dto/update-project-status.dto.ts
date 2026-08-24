import { IsHexColor, IsIn, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { PROJECT_STATUS_CATEGORIES } from './create-project-status.dto';

export class UpdateProjectStatusDto {
   @IsOptional() @IsString() @MinLength(1) @MaxLength(32) name?: string;
   @IsOptional() @IsIn(PROJECT_STATUS_CATEGORIES) category?: string;
   @IsOptional() @IsHexColor() color?: string;
   @IsOptional() @IsInt() @Min(0) position?: number;
}
