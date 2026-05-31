/**
 * CV Claim Extractor — Parses structured CV claims from uploaded CV files.
 *
 * Architecture: Accepts raw text/PDF content and extracts structured claims
 * (companies, roles, date ranges, tech stacks, education) that can be
 * cross-referenced against the Signal Corpus.
 *
 * This service uses pattern matching for initial extraction. For richer
 * extraction, it can delegate to Deepseek v4 via LLMIntegrationService.
 *
 * Reference: DEEPSEEK_V4_REFACTOR_PLAN.md Stage 6 (CV verification layer)
 */

import { Injectable } from '@nestjs/common';
import { CvClaim } from '../modules/module.interface';

export interface CvExtractionResult {
  claims: CvClaim[];
  rawText: string;
  extractionMethod: 'pattern' | 'llm';
  confidence: 'high' | 'medium' | 'low';
}

@Injectable()
export class CvClaimExtractorService {
  /**
   * Extract structured claims from raw CV text.
   * Uses regex patterns for company names, dates, tech stacks.
   */
  extractFromText(rawText: string): CvExtractionResult {
    console.log(
      `[CvClaimExtractor] phase=extract_start textLength=${rawText.length}`,
    );

    const claims: CvClaim[] = [];

    // 1. Extract company claims: look for company names near employment keywords
    const companyPatterns = [
      /(?:at|for|with)\s+([A-Z][A-Za-z0-9\s&.]+?)(?:\s*[,.!\n]|$)/g,
      /(?:^|\n)\s*([A-Z][A-Za-z0-9\s&.]+?)\s*[-–|]\s*(?:Software|Engineer|Developer|Architect|Lead)/g,
    ];

    for (const pattern of companyPatterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(rawText)) !== null) {
        const company = match[1].trim();
        if (company.length > 2 && company.length < 60) {
          // Deduplicate
          if (!claims.some((c) => c.type === 'company' && c.value === company)) {
            claims.push({
              type: 'company',
              value: company,
              confidence: 'explicit',
              source_text: match[0].trim().slice(0, 100),
            });
          }
        }
      }
    }

    // 2. Extract role/title claims
    const rolePatterns = [
      /(?:^|\n)\s*([A-Z][A-Za-z\s/]+(?:Engineer|Developer|Architect|Lead|Manager|Director|Scientist|Intern))/gm,
      /(?:as\s+a\s+)(?:Senior\s+|Staff\s+|Lead\s+|Principal\s+)?([A-Za-z\s/]+(?:Engineer|Developer|Architect))/gi,
    ];

    for (const pattern of rolePatterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(rawText)) !== null) {
        const role = match[1].trim();
        if (role.length > 3 && role.length < 50) {
          if (!claims.some((c) => c.type === 'role' && c.value === role)) {
            claims.push({
              type: 'role',
              value: role,
              confidence: 'explicit',
              source_text: match[0].trim().slice(0, 100),
            });
          }
        }
      }
    }

    // 3. Extract date range claims
    const datePatterns = [
      /(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)[,\s]*(\d{4})\s*[-–to]+\s*(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)?[,\s]*(\d{4}|Present)/gi,
      /(\d{4})\s*[-–to]+\s*(\d{4}|Present)/g,
    ];

    for (const pattern of datePatterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(rawText)) !== null) {
        const dateRange = match[0].trim();
        if (dateRange.length > 6 && dateRange.length < 40) {
          claims.push({
            type: 'date_range',
            value: dateRange,
            confidence: 'explicit',
            source_text: match[0].trim().slice(0, 100),
          });
        }
      }
    }

    // 4. Extract tech stack claims
    const techKeywords = [
      'JavaScript', 'TypeScript', 'Python', 'Java', 'Go', 'Rust', 'Ruby',
      'React', 'Angular', 'Vue', 'Node', 'Express', 'Django', 'Flask', 'Spring',
      'AWS', 'GCP', 'Azure', 'Docker', 'Kubernetes', 'Terraform',
      'PostgreSQL', 'MongoDB', 'Redis', 'MySQL', 'Cassandra',
      'GraphQL', 'REST', 'gRPC', 'Kafka', 'RabbitMQ',
    ];

    const foundTech = new Set<string>();
    for (const tech of techKeywords) {
      // Escape special regex characters (e.g. C++ contains '+')
      const escaped = tech.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
      if (regex.test(rawText)) {
        foundTech.add(tech);
      }
    }

    if (foundTech.size > 0) {
      claims.push({
        type: 'tech_stack',
        value: Array.from(foundTech).join(', '),
        confidence: 'explicit',
        source_text: `Detected technologies: ${Array.from(foundTech).join(', ')}`,
      });
    }

    console.log(
      `[CvClaimExtractor] phase=extract_complete ` +
      `claims=${claims.length} companies=${claims.filter(c => c.type === 'company').length} ` +
      `roles=${claims.filter(c => c.type === 'role').length} ` +
      `dates=${claims.filter(c => c.type === 'date_range').length} ` +
      `techs=${foundTech.size}`,
    );

    return {
      claims,
      rawText,
      extractionMethod: 'pattern',
      confidence: claims.length > 3 ? 'high' : claims.length > 1 ? 'medium' : 'low',
    };
  }

  /**
   * Merge newly extracted claims with existing claims (from a previous extraction).
   * Deduplicates by type + value.
   */
  mergeClaims(existing: CvClaim[], incoming: CvClaim[]): CvClaim[] {
    const seen = new Set(existing.map((c) => `${c.type}:${c.value}`));
    const merged = [...existing];

    for (const claim of incoming) {
      const key = `${claim.type}:${claim.value}`;
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(claim);
      }
    }

    return merged;
  }
}