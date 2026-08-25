import {
   IsBoolean,
   IsHexColor,
   IsInt,
   IsEnum,
   IsOptional,
   IsString,
   Max,
   MaxLength,
   Min,
   MinLength,
} from 'class-validator';
import { TeamJoinPolicy } from '@circle/database';

export class UpdateTeamDto {
   @IsOptional() @IsString() @MinLength(2) @MaxLength(80) name?: string;
   @IsOptional() @IsString() @MaxLength(500) description?: string;
   @IsOptional() @IsString() @MaxLength(16) icon?: string;
   @IsOptional() @IsHexColor() color?: string;
   @IsOptional() @IsBoolean() triageEnabled?: boolean;
   @IsOptional() @IsEnum(TeamJoinPolicy) joinPolicy?: TeamJoinPolicy;
   @IsOptional() @IsInt() @Min(1) @Max(12) cycleCadenceWeeks?: number | null;
   @IsOptional() @IsInt() @Min(1) @Max(3650) autoCloseDays?: number | null;
   @IsOptional() @IsInt() @Min(1) @Max(3650) autoArchiveDays?: number | null;
   @IsOptional() @IsString() parentTeamId?: string | null;
   @IsOptional() @IsString() defaultIssueTemplateId?: string | null;
}
