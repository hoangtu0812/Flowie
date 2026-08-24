import { IssuePriority } from '@circle/database';
import { IsArray, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateIssueTemplateDto {
   @IsString() workspaceId!: string;
   @IsString() @MinLength(2) @MaxLength(120) name!: string;
   @IsOptional() @IsString() @MaxLength(500) description?: string;
   @IsString() @MinLength(2) @MaxLength(500) title!: string;
   @IsOptional() @IsString() @MaxLength(10000) issueDescription?: string;
   @IsOptional() @IsString() statusId?: string;
   @IsOptional() @IsEnum(IssuePriority) priority?: IssuePriority;
   @IsOptional() @IsString() projectId?: string;
   @IsOptional() @IsString() assigneeId?: string;
   @IsOptional() @IsArray() @IsString({ each: true }) labelIds?: string[];
}
