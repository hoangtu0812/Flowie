import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateLabelGroupDto {
   @IsString() workspaceId!: string;
   @IsString() @MinLength(1) @MaxLength(80) name!: string;
   @IsOptional() @IsString() @MaxLength(500) description?: string;
}
