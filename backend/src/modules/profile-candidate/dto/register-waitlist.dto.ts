import { IsEmail } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterWaitlistDto {
  @ApiProperty({ example: 'candidate@example.com' })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email: string;
}
