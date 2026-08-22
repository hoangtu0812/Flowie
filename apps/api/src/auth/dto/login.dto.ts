import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
   @ApiProperty({ example: 'minh@example.com' })
   @IsEmail()
   @MaxLength(320)
   @Transform(({ value }: { value: string }) => value.trim().toLowerCase())
   email!: string;

   @ApiProperty({ format: 'password' })
   @IsString()
   @MinLength(1)
   @MaxLength(128)
   password!: string;
}
