import { IsHexColor, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateLabelDto {
   @IsString() workspaceId!: string;
   @IsString() @MinLength(1) @MaxLength(80) name!: string;
   @IsHexColor() color!: string;
   @IsOptional() @IsString() @MaxLength(500) description?: string;
   @IsOptional() @IsString() groupId?: string;
}
