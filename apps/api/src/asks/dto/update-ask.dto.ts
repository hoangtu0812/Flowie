import { IssuePriority } from '@circle/database';
import { IsEnum, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export const askStatuses = ['open', 'accepted', 'declined'] as const;

export class UpdateAskDto {
   @IsOptional() @IsString() teamId?: string;
   @IsOptional() @IsString() projectId?: string | null;
   @IsOptional() @IsString() @MinLength(2) @MaxLength(500) title?: string;
   @IsOptional() @IsString() @MaxLength(10000) description?: string | null;
   @IsOptional() @IsEnum(IssuePriority) priority?: IssuePriority;
   @IsOptional() @IsIn(askStatuses) status?: (typeof askStatuses)[number];
}
