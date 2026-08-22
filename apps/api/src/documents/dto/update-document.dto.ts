import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateDocumentDto {
   @IsOptional() @IsString() @MinLength(2) @MaxLength(250) title?: string;
   @IsOptional() @IsString() @MaxLength(100000) content?: string;
}
