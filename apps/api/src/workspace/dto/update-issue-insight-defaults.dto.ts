import { IsIn } from 'class-validator';

export class UpdateIssueInsightDefaultsDto {
   @IsIn(['issue-count']) measure!: string;
   @IsIn(['status']) slice!: string;
   @IsIn(['priority']) segment!: string;
}
