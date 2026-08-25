import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateLabelGroupDto {
   @IsOptional() @IsString() @MinLength(1) @MaxLength(80) name?: string;
   @IsOptional() @IsString() @MaxLength(500) description?: string | null;
}
