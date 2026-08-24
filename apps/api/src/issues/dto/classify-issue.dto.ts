import { IssueResolution } from '@circle/database';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class ClassifyIssueDto {
   @IsString()
   workspaceId!: string;

   @IsEnum(IssueResolution)
   resolution!: IssueResolution;

   @IsOptional()
   @IsString()
   duplicateOfIdentifier?: string;
}
