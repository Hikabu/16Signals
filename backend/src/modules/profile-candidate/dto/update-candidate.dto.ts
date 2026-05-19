import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class UpdateCandidateDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  bio?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  location?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  website?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  careerPath?: number;

  @IsOptional()
  @IsString()
  avatarUrl?: string;

}
