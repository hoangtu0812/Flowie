import { Type } from 'class-transformer';
import {
   IsArray,
   IsBoolean,
   IsEnum,
   IsInt,
   IsOptional,
   IsString,
   MaxLength,
   Min,
   MinLength,
} from 'class-validator';
import { ProjectCustomFieldType } from '@circle/database';

export class CreateProjectCustomFieldDto {
   @IsString() workspaceId!: string;
   @IsString() @MinLength(1) @MaxLength(80) name!: string;
   @IsEnum(ProjectCustomFieldType) type!: ProjectCustomFieldType;
   @IsOptional() @IsString() @MaxLength(500) description?: string;
   @IsOptional() @IsArray() @IsString({ each: true }) options?: string[];
   @IsOptional() @IsBoolean() required?: boolean;
   @IsOptional() @Type(() => Number) @IsInt() @Min(0) position?: number;
}
