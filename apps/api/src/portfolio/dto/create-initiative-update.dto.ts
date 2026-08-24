import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateInitiativeUpdateDto {
   @IsString() workspaceId!: string;
   @IsString() @MinLength(1) @MaxLength(5000) body!: string;
   @IsOptional() @IsString() @MaxLength(32) health?: string;
}
