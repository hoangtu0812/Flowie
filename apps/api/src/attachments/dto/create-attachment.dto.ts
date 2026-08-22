import { IsIn, IsString } from 'class-validator';

export class CreateAttachmentDto {
   @IsString() workspaceId!: string;
   @IsIn(['issue', 'comment', 'project', 'document']) entityType!:
      'issue' | 'comment' | 'project' | 'document';
   @IsString() entityId!: string;
}
