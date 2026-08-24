import { IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class UpdateDocumentFolderDto {
   @IsOptional() @IsString() @MinLength(2) @MaxLength(100) name?: string;
   @IsOptional() @IsString() @MinLength(1) @MaxLength(32) icon?: string;
   @IsOptional() @IsInt() @Min(0) position?: number;
}
