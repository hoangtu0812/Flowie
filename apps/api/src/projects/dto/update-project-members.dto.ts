import { ArrayMaxSize, ArrayUnique, IsArray, IsNotEmpty, IsString } from 'class-validator';

export class UpdateProjectMembersDto {
   @IsString()
   @IsNotEmpty()
   workspaceId!: string;

   @IsArray()
   @ArrayMaxSize(100)
   @ArrayUnique()
   @IsString({ each: true })
   @IsNotEmpty({ each: true })
   userIds!: string[];
}
