import { IsEnum } from 'class-validator';
import { TeamMemberRole } from '@circle/database';

export class UpdateTeamMemberDto {
   @IsEnum(TeamMemberRole) role!: TeamMemberRole;
}
