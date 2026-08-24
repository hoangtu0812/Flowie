import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateProjectUpdateDto {
   @IsString() workspaceId!: string;

   @IsString() @MinLength(1) @MaxLength(4000) body!: string;
}
