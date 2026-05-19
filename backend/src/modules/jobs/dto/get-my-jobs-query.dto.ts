import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional } from 'class-validator';

export type CompanyJobsStatusFilter = 'draft' | 'active' | 'all';

export class GetMyJobsQueryDto {
  @ApiPropertyOptional({
    enum: ['draft', 'active', 'all'],
    description:
      'Filter jobs returned for the authenticated company. Omit or use `all` for every status.',
  })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.toLowerCase().trim() : value,
  )
  @IsIn(['draft', 'active', 'all'])
  status?: CompanyJobsStatusFilter;
}
