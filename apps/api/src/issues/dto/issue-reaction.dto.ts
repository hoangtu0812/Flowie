import { IsIn, IsString } from 'class-validator';

export const issueReactionEmojis = ['👍', '👎', '🎉', '❤️', '👀'] as const;

export class IssueReactionDto {
   @IsString() workspaceId!: string;
   @IsIn(issueReactionEmojis) emoji!: (typeof issueReactionEmojis)[number];
}
