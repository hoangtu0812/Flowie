import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class RefreshDto {
   @ApiPropertyOptional({ description: 'Only for non-browser API clients.' })
   @IsOptional()
   @IsString()
   @MaxLength(512)
   refreshToken?: string;
}
