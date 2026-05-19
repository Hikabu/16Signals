import { AnalysisResult } from '../scoring/types/result.types';

export type ScorecardResult = AnalysisResult;

export interface PreviewRequestDto {
  githubUsername: string;
}
