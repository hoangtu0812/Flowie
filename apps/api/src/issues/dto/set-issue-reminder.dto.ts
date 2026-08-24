import { IsDateString, IsString } from 'class-validator';

export class SetIssueReminderDto {
   @IsString() workspaceId!: string;
   @IsDateString() remindAt!: string;
}
