import { IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateCommentDto {
   @IsString() workspaceId!: string;
   @IsString() issueId!: string;
   @IsOptional() @IsString() @MinLength(1) @MaxLength(20000) content?: string;
   @IsOptional() @IsObject() body?: Record<string, unknown>;
}
