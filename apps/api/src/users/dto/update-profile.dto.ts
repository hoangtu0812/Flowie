import { IsOptional, IsString, IsUrl, MaxLength, MinLength } from 'class-validator';

export class UpdateProfileDto {
   @IsOptional()
   @IsString()
   @MinLength(2)
   @MaxLength(120)
   name?: string;

   @IsOptional()
   @IsString()
   @MinLength(2)
   @MaxLength(48)
   username?: string;

   @IsOptional()
   @IsUrl({ require_tld: false })
   @MaxLength(2048)
   avatarUrl?: string;
}
