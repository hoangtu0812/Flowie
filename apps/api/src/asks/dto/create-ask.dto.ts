import { IssuePriority } from '@circle/database';
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateAskDto {
   @IsString() workspaceId!: string;
   @IsString() teamId!: string;
   @IsOptional() @IsString() projectId?: string | null;
   @IsString() @MinLength(2) @MaxLength(500) title!: string;
   @IsOptional() @IsString() @MaxLength(10000) description?: string | null;
   @IsOptional() @IsEnum(IssuePriority) priority?: IssuePriority;
}
