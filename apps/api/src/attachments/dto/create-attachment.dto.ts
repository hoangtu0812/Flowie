import { IsIn, IsString } from 'class-validator';

export class CreateAttachmentDto {
   @IsString() workspaceId!: string;
   @IsIn(['issue', 'comment', 'project', 'project-update', 'document']) entityType!:
      | 'issue'
      | 'comment'
      | 'project'
      | 'project-update'
      | 'document';
   @IsString() entityId!: string;
}
