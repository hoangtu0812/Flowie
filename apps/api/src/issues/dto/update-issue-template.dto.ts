import { IssuePriority } from '@circle/database';
import { IsArray, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateIssueTemplateDto {
   @IsOptional() @IsString() @MinLength(2) @MaxLength(120) name?: string;
   @IsOptional() @IsString() @MaxLength(500) description?: string | null;
   @IsOptional() @IsString() @MinLength(2) @MaxLength(500) title?: string;
   @IsOptional() @IsString() @MaxLength(10000) issueDescription?: string | null;
   @IsOptional() @IsString() statusId?: string | null;
   @IsOptional() @IsEnum(IssuePriority) priority?: IssuePriority;
   @IsOptional() @IsString() projectId?: string | null;
   @IsOptional() @IsString() assigneeId?: string | null;
   @IsOptional() @IsArray() @IsString({ each: true }) labelIds?: string[];
}
