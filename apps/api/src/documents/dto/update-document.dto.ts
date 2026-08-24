import { IsBoolean, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class UpdateDocumentDto {
   @IsOptional() @IsString() folderId?: string;
   @IsOptional() @IsString() @MinLength(2) @MaxLength(250) title?: string;
   @IsOptional() @IsString() @MaxLength(100000) content?: string;
   @IsOptional() @IsString() @MinLength(1) @MaxLength(32) icon?: string;
   @IsOptional() @IsBoolean() pinned?: boolean;
   @IsOptional() @IsInt() @Min(0) position?: number;
}
