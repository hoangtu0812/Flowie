import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateProjectUpdateDto {
   @IsString() workspaceId!: string;

   @IsString() @MinLength(1) @MaxLength(4000) body!: string;

   @IsOptional()
   @IsIn(['update', 'comment'])
   kind?: 'update' | 'comment';

   @IsOptional()
   @IsIn(['on-track', 'at-risk', 'off-track'])
   health?: 'on-track' | 'at-risk' | 'off-track';
}
