import { IssueRelationType } from '@circle/database';
import { IsEnum, IsString } from 'class-validator';

export class UpdateIssueRelationDto {
   @IsString() workspaceId!: string;
   @IsEnum(IssueRelationType) type!: IssueRelationType;
}
