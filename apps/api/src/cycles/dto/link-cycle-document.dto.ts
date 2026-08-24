import { IsString } from 'class-validator';

export class LinkCycleDocumentDto {
   @IsString() workspaceId!: string;
   @IsString() documentId!: string;
}
