import { Allow, IsString } from 'class-validator';

export class UpdateProjectCustomFieldValueDto {
   @IsString() workspaceId!: string;

   @Allow() value!: unknown;
}
