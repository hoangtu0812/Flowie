import { IssueRelationType } from '@circle/database';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class LinkIssueDto {
   @IsString() workspaceId!: string;
   @IsString() relatedIssueId!: string;
   @IsOptional() @IsEnum(IssueRelationType) type?: IssueRelationType;
}
