import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ProjectType } from '@circle/database';
export class CreateProjectDto {
   @IsString() workspaceId!: string;
   @IsOptional() @IsString() templateId?: string;
   @IsOptional() @IsString() teamId?: string;
   @IsString() @MinLength(2) @MaxLength(120) name!: string;
   @IsString() @MaxLength(24) identifier!: string;
   @IsOptional() @IsString() @MaxLength(2000) description?: string;
   @IsOptional() @IsEnum(ProjectType) type?: ProjectType;
}
