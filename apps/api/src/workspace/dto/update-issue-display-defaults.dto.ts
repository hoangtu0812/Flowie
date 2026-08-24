import { Type } from 'class-transformer';
import { IsBoolean, IsIn, ValidateNested } from 'class-validator';

class IssueDisplayPropertiesDto {
   @IsBoolean() id!: boolean;
   @IsBoolean() status!: boolean;
   @IsBoolean() priority!: boolean;
   @IsBoolean() assignee!: boolean;
   @IsBoolean() labels!: boolean;
   @IsBoolean() project!: boolean;
   @IsBoolean() dueDate!: boolean;
   @IsBoolean() created!: boolean;
   @IsBoolean() cycle!: boolean;
}

export class UpdateIssueDisplayDefaultsDto {
   @IsIn(['list', 'grid']) viewType!: string;
   @IsIn(['status', 'assignee', 'priority', 'project', 'none']) grouping!: string;
   @IsIn(['priority', 'created', 'title']) ordering!: string;
   @IsBoolean() orderCompletedByRecency!: boolean;
   @IsIn(['all', 'none']) completedIssues!: string;
   @IsBoolean() showSubIssues!: boolean;
   @IsBoolean() showEmptyGroups!: boolean;
   @ValidateNested()
   @Type(() => IssueDisplayPropertiesDto)
   displayProperties!: IssueDisplayPropertiesDto;
}
