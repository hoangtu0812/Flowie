import { IsString } from 'class-validator';

export class MoveIssueDto {
   @IsString() workspaceId!: string;
   @IsString() teamId!: string;
}
