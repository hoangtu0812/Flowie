import { IsString } from 'class-validator';

export class LinkIssueDto {
   @IsString() workspaceId!: string;
   @IsString() relatedIssueId!: string;
}
