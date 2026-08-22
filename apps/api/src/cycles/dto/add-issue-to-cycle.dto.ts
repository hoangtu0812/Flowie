import { IsString } from 'class-validator';

export class AddIssueToCycleDto {
   @IsString() workspaceId!: string;
   @IsString() issueId!: string;
}
