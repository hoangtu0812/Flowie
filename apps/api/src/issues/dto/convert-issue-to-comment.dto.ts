import { IsString, Matches } from 'class-validator';

export class ConvertIssueToCommentDto {
   @IsString()
   workspaceId!: string;

   @IsString()
   @Matches(/^[A-Za-z0-9][A-Za-z0-9_-]*-\d+$/, {
      message: 'targetIdentifier must be a valid issue identifier.',
   })
   targetIdentifier!: string;
}
