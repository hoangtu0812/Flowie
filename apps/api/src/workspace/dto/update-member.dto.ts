import { IsEnum } from 'class-validator';
import { WorkspaceMemberRole } from '@circle/database';

export class UpdateMemberDto {
   @IsEnum(WorkspaceMemberRole) role!: WorkspaceMemberRole;
}
