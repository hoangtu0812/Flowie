import { Type } from 'class-transformer';
import { IsBoolean, IsIn, ValidateNested } from 'class-validator';

class ProjectViewTypesDto {
   @IsIn(['list', 'board', 'timeline']) all!: string;
   @IsIn(['list', 'board', 'timeline']) active!: string;
}

class ProjectDisplayPropertiesDto {
   @IsBoolean() milestones!: boolean;
   @IsBoolean() priority!: boolean;
   @IsBoolean() status!: boolean;
   @IsBoolean() health!: boolean;
   @IsBoolean() lead!: boolean;
   @IsBoolean() members!: boolean;
   @IsBoolean() targetDate!: boolean;
   @IsBoolean() issues!: boolean;
   @IsBoolean() labels!: boolean;
}

export class UpdateProjectDisplayDefaultsDto {
   @ValidateNested() @Type(() => ProjectViewTypesDto) viewTypes!: ProjectViewTypesDto;
   @IsIn(['team', 'none']) grouping!: string;
   @IsIn(['start-date', 'target-date', 'title']) ordering!: string;
   @IsIn(['all', 'hide']) closedProjects!: string;
   @IsBoolean() showEmptyGroups!: boolean;
   @IsBoolean() showProjectList!: boolean;
   @IsBoolean() showWeekNumbers!: boolean;
   @ValidateNested()
   @Type(() => ProjectDisplayPropertiesDto)
   displayProperties!: ProjectDisplayPropertiesDto;
}
