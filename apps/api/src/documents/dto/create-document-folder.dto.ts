import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateDocumentFolderDto {
   @IsString() workspaceId!: string;
   @IsString() teamId!: string;
   @IsString() @MinLength(2) @MaxLength(100) name!: string;
   @IsOptional() @IsString() @MinLength(1) @MaxLength(32) icon?: string;
}
