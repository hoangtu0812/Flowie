import { IsDateString, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateApiKeyDto {
   @IsString()
   @MinLength(2)
   @MaxLength(80)
   name!: string;

   @IsOptional()
   @IsDateString()
   expiresAt?: string;
}
