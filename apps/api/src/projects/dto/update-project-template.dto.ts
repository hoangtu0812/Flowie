import { ProjectType } from '@circle/database';
import { IsEnum, IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateProjectTemplateDto {
   @IsOptional() @IsString() @MinLength(2) @MaxLength(120) name?: string;
   @IsOptional() @IsString() @MaxLength(2000) description?: string;
   @IsOptional() @IsEnum(ProjectType) type?: ProjectType;
   @IsOptional() @IsObject() config?: Record<string, unknown>;
}
