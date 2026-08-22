import { IsEnum, IsString } from 'class-validator';
import { TeamMemberRole } from '@circle/database';

export class AddTeamMemberDto {
   @IsString() workspaceId!: string;
   @IsString() userId!: string;
   @IsEnum(TeamMemberRole) role!: TeamMemberRole;
}
