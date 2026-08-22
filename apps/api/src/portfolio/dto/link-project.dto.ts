import { IsString } from 'class-validator';

export class LinkProjectDto {
   @IsString() workspaceId!: string;
   @IsString() projectId!: string;
}
