import { Transform } from 'class-transformer';
import { IsHexColor, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateTeamDto {
   @IsString() workspaceId!: string;
   @IsString() @MinLength(2) @MaxLength(80) name!: string;
   @IsString()
   @Transform(({ value }: { value: string }) => value.trim().toUpperCase())
   @MaxLength(12)
   identifier!: string;
   @IsOptional() @IsString() @MaxLength(500) description?: string;
   @IsOptional() @IsString() @MaxLength(16) icon?: string;
   @IsOptional() @IsHexColor() color?: string;
}
