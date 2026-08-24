import { IsString, IsUrl, MaxLength, MinLength } from 'class-validator';

export class CreateProjectResourceDto {
   @IsString() workspaceId!: string;
   @IsString() @MinLength(1) @MaxLength(160) label!: string;
   @IsString() @IsUrl({ require_protocol: true }) @MaxLength(2000) url!: string;
}
