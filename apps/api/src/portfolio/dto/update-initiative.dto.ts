import { IsDateString, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateInitiativeDto {
   @IsOptional() @IsString() @MinLength(2) @MaxLength(160) name?: string;
   @IsOptional() @IsString() @MaxLength(2000) description?: string | null;
   @IsOptional() @IsString() @MaxLength(32) status?: string;
   @IsOptional() @IsString() @MaxLength(32) priority?: string;
   @IsOptional() @IsString() @MaxLength(32) health?: string;
   @IsOptional() @IsString() @MaxLength(16) icon?: string | null;
   @IsOptional() @IsString() ownerId?: string | null;
   @IsOptional() @IsDateString() targetDate?: string | null;
}
