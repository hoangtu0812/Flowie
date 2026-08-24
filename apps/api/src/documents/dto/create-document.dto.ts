import { IsBoolean, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class CreateDocumentDto {
   @IsString() workspaceId!: string;
   @IsOptional() @IsString() teamId?: string;
   @IsOptional() @IsString() folderId?: string;
   @IsString() @MinLength(2) @MaxLength(250) title!: string;
   @IsOptional() @IsString() @MaxLength(100000) content?: string;
   @IsOptional() @IsString() @MinLength(1) @MaxLength(32) icon?: string;
   @IsOptional() @IsBoolean() pinned?: boolean;
   @IsOptional() @IsInt() @Min(0) position?: number;
}
