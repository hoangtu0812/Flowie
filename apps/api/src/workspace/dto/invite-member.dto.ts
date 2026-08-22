import { IsEmail, IsEnum, IsOptional } from 'class-validator';
import { WorkspaceMemberRole } from '@circle/database';

export class InviteMemberDto {
   @IsEmail() email!: string;
   @IsOptional() @IsEnum(WorkspaceMemberRole) role?: WorkspaceMemberRole;
}
