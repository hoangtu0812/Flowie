import { IsHexColor, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateTeamDto {
   @IsOptional() @IsString() @MinLength(2) @MaxLength(80) name?: string;
   @IsOptional() @IsString() @MaxLength(500) description?: string;
   @IsOptional() @IsString() @MaxLength(16) icon?: string;
   @IsOptional() @IsHexColor() color?: string;
}
