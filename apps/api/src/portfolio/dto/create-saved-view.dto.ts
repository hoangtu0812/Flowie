import {
   IsBoolean,
   IsIn,
   IsObject,
   IsOptional,
   IsString,
   MaxLength,
   MinLength,
} from 'class-validator';

export class CreateSavedViewDto {
   @IsString() workspaceId!: string;
   @IsString() @MinLength(2) @MaxLength(120) name!: string;
   @IsOptional() @IsString() @MaxLength(500) description?: string;
   @IsIn(['issue', 'project']) entityType!: 'issue' | 'project';
   @IsOptional() @IsObject() filters?: Record<string, unknown>;
   @IsOptional() @IsBoolean() isShared?: boolean;
}
