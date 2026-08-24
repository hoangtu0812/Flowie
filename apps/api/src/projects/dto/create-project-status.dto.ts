import { IsHexColor, IsIn, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

export const PROJECT_STATUS_CATEGORIES = [
   'backlog',
   'planned',
   'in-progress',
   'completed',
   'canceled',
] as const;

export class CreateProjectStatusDto {
   @IsString() workspaceId!: string;
   @IsString() @MinLength(1) @MaxLength(32) name!: string;
   @IsIn(PROJECT_STATUS_CATEGORIES) category!: string;
   @IsHexColor() color!: string;
   @IsOptional() @IsInt() @Min(0) position?: number;
}
