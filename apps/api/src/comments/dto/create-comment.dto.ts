import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateCommentDto {
   @IsString() workspaceId!: string;
   @IsString() issueId!: string;
   @IsString() @MinLength(1) @MaxLength(20000) content!: string;
}
