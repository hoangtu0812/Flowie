import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateWorkspaceEmojiDto {
   @IsString() workspaceId!: string;

   @IsString()
   @MinLength(2)
   @MaxLength(32)
   @Matches(/^[a-z0-9][a-z0-9_-]*$/, {
      message: 'Emoji name may only contain lowercase letters, numbers, underscores and hyphens.',
   })
   name!: string;
}
