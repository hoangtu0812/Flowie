import {
   IsArray,
   IsDateString,
   IsIn,
   IsOptional,
   IsString,
   MaxLength,
   MinLength,
} from 'class-validator';
import { releaseStatuses } from './create-release.dto';

export class UpdateReleaseDto {
   @IsOptional() @IsString() @MinLength(2) @MaxLength(160) name?: string;
   @IsOptional() @IsString() @MinLength(1) @MaxLength(80) version?: string;
   @IsOptional() @IsString() @MaxLength(5000) description?: string | null;
   @IsOptional() @IsIn(releaseStatuses) status?: (typeof releaseStatuses)[number];
   @IsOptional() @IsDateString() targetDate?: string | null;
   @IsOptional() @IsArray() @IsString({ each: true }) projectIds?: string[];
}
