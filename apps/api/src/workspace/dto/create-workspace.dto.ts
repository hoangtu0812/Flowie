import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateWorkspaceDto {
   @IsString() @MinLength(2) @MaxLength(120) name!: string;
}
