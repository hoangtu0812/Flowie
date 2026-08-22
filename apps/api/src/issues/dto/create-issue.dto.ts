import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { IssuePriority } from '@circle/database';

export class CreateIssueDto {
   @IsString() workspaceId!: string;
   @IsString() teamId!: string;
   @IsString() @MinLength(2) @MaxLength(500) title!: string;
   @IsOptional() @IsString() @MaxLength(10000) description?: string;
   @IsOptional() @IsString() statusId?: string;
   @IsOptional() @IsString() projectId?: string;
   @IsOptional() @IsString() assigneeId?: string;
   @IsOptional() @IsEnum(IssuePriority) priority?: IssuePriority;
   @IsOptional()
   @Transform(({ value }) => Number(value))
   @IsInt()
   @Min(0)
   estimate?: number;
}
