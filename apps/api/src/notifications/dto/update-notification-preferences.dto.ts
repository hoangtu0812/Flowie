import { IsBoolean } from 'class-validator';

export class UpdateNotificationPreferencesDto {
   @IsBoolean() teamIssueAdded!: boolean;
   @IsBoolean() issueCompleted!: boolean;
   @IsBoolean() issueAddedToTriage!: boolean;
}
