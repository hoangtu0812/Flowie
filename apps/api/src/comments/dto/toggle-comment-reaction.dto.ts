import { IsString, MaxLength, MinLength } from 'class-validator';

export class ToggleCommentReactionDto {
   @IsString() workspaceId!: string;
   @IsString() @MinLength(1) @MaxLength(32) emoji!: string;
}
