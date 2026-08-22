import { IsDateString, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateInitiativeDto {
   @IsString() workspaceId!: string;
   @IsString() @MinLength(2) @MaxLength(160) name!: string;
   @IsOptional() @IsString() @MaxLength(2000) description?: string;
   @IsOptional() @IsString() @MaxLength(32) status?: string;
   @IsOptional() @IsString() @MaxLength(32) priority?: string;
   @IsOptional() @IsString() @MaxLength(32) health?: string;
   @IsOptional() @IsString() @MaxLength(16) icon?: string;
   @IsOptional() @IsString() ownerId?: string;
   @IsOptional() @IsDateString() targetDate?: string;
}
