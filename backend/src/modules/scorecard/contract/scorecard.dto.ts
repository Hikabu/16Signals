import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  ScorecardPreviewRequestSchema,
  RawUiSchema,
} from './scorecard.contract';

/**
 * UI scorecard DTO — view-specific output (union type, use z.any() for nestjs-zod compat).
 */
export class ScorecardUiDto extends createZodDto(z.any()) {}

/**
 * Preview request DTO.
 */
export class ScorecardPreviewRequestDto extends createZodDto(
  ScorecardPreviewRequestSchema,
) {}

/**
 * Raw scorecard response DTO — full debug data.
 */
export class ScorecardRawResponseDto extends createZodDto(RawUiSchema) {}