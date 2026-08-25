import { IsOptional, IsString, IsUrl, MaxLength, MinLength } from 'class-validator';

export class UpdateProfileDto {
   @IsOptional()
   @IsString()
   @MinLength(2)
   @MaxLength(120)
   name?: string;

   @IsOptional()
   @IsString()
   @MaxLength(48)
   username?: string;

   @IsOptional()
   @IsString()
   @MaxLength(120)
   title?: string;

   @IsOptional()
   @IsUrl({ require_tld: false })
   @MaxLength(2048)
   avatarUrl?: string;

   @IsOptional()
   @IsString()
   @MaxLength(100)
   timezone?: string;
}
