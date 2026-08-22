import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ProjectType } from '@circle/database';

export class UpdateProjectDto {
   @IsOptional() @IsString() @MinLength(2) @MaxLength(120) name?: string;
   @IsOptional() @IsString() @MaxLength(2000) description?: string;
   @IsOptional() @IsString() @MaxLength(32) status?: string;
   @IsOptional() @IsString() @MaxLength(32) priority?: string;
   @IsOptional() @IsString() @MaxLength(32) health?: string;
   @IsOptional() @IsString() leadId?: string;
   @IsOptional() @IsEnum(ProjectType) type?: ProjectType;
}
