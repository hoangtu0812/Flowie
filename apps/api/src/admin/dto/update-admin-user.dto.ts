import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { UserStatus } from '@circle/database';

export class UpdateAdminUserDto {
   @IsOptional()
   @IsEnum(UserStatus)
   status?: UserStatus;

   @IsOptional()
   @IsBoolean()
   isPlatformAdmin?: boolean;
}
