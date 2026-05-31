/**
 * LLM Response Fixtures — Mock responses for Stage 5 unit tests.
 * Used to test JSON parsing, fallback logic, and prompt construction
 * without making actual API calls.
 *
 * Reference: DEEPSEEK_V4_REFACTOR_PLAN.md Stage 5
 */

import { Wave3BatchOutput, NarrativeOutput, InterviewQuestion } from '../../llm-response.types';

/** Valid Wave 3 batch response from Deepseek v4 */
export const VALID_WAVE3_JSON_RESPONSE = JSON.stringify({
  commit_quality: [85, 78, 92, 65, 88],
  pr_description_quality: [72, 90, 45],
  review_depth: ['root_cause', 'LGTM_only', 'surface'],
  hard_problem_detection: ['hard_problem', 'routine', 'moderate', 'unclear'],
  ai_leverage: {
    classification: 'traditional',
    confidence_0_to_100: 75,
    reasoning: 'Commit patterns show consistent human authoring style, no AI-disclosure markers detected.',
    key_evidence: ['consistent_commit_message_style', 'no_ai_config_files'],
  },
});

/** Valid Wave 3 formatted as expected parse output */
export const VALID_WAVE3_PARSED: Wave3BatchOutput = {
  commit_quality: [85, 78, 92, 65, 88],
  pr_description_quality: [72, 90, 45],
  review_depth: ['root_cause', 'LGTM_only', 'surface'],
  hard_problem_detection: ['hard_problem', 'routine', 'moderate', 'unclear'],
  ai_leverage: {
    classification: 'traditional',
    confidence_0_to_100: 75,
    reasoning: 'Commit patterns show consistent human authoring style, no AI-disclosure markers detected.',
    key_evidence: ['consistent_commit_message_style', 'no_ai_config_files'],
  },
};

/** Wave 3 response wrapped in markdown fences (common LLM output) */
export const WAVE3_MARKDOWN_FENCED = '```json\n' + VALID_WAVE3_JSON_RESPONSE + '\n```';

/** Wave 3 response with missing optional fields — should use fallbacks */
export const WAVE3_PARTIAL_RESPONSE = JSON.stringify({
  commit_quality: [80],
  ai_leverage: {
    classification: 'ai_operator',
    confidence_0_to_100: 60,
    reasoning: 'Some AI config files found.',
    key_evidence: [],
  },
});

/** Invalid JSON response — should trigger fallback */
export const WAVE3_INVALID_JSON = 'This is not JSON at all';

/** Wave 3 response with invalid classification — should default to 'traditional' */
export const WAVE3_INVALID_CLASSIFICATION = JSON.stringify({
  commit_quality: [],
  pr_description_quality: [],
  review_depth: [],
  hard_problem_detection: [],
  ai_leverage: {
    classification: 'invalid_category',
    confidence_0_to_100: 100,
    reasoning: 'Test',
    key_evidence: [],
  },
});

/** Expected parsed output for partial response */
export const WAVE3_PARTIAL_PARSED: Wave3BatchOutput = {
  commit_quality: [80],
  pr_description_quality: [],
  review_depth: [],
  hard_problem_detection: [],
  ai_leverage: {
    classification: 'ai_operator',
    confidence_0_to_100: 60,
    reasoning: 'Some AI config files found.',
    key_evidence: [],
  },
};

/** Valid narrative response with section delimiters */
export const VALID_NARRATIVE_RESPONSE = `---SECTION_A---
Tyler has demonstrated consistent backend engineering skills with 550+ commits across multiple repositories, primarily in TypeScript and Python. Commit cadence is stable with 12 months of continuous activity, suggesting reliable long-term engagement. Strong CI practices are evident across repos.
---SECTION_B---
No CV claims provided for cross-reference.
---SECTION_C---
Work patterns show a preference for mid-sized commits (median 85 lines) with substantive PR descriptions, indicating thoughtful, review-ready contributions. Collaboration signals show active code review participation.`;

/** Expected parsed narrative output */
export const VALID_NARRATIVE_PARSED: NarrativeOutput = {
  profile_summary: 'Tyler has demonstrated consistent backend engineering skills with 550+ commits across multiple repositories, primarily in TypeScript and Python. Commit cadence is stable with 12 months of continuous activity, suggesting reliable long-term engagement. Strong CI practices are evident across repos.',
  cv_cross_reference: 'No CV claims provided for cross-reference.',
  work_pattern_intelligence: 'Work patterns show a preference for mid-sized commits (median 85 lines) with substantive PR descriptions, indicating thoughtful, review-ready contributions. Collaboration signals show active code review participation.',
};

/** Valid interview questions JSON response */
export const VALID_INTERVIEW_JSON_RESPONSE = JSON.stringify([
  {
    type: 'experience_depth',
    question: 'Your commit history shows limited work in concurrency — can you describe a time you handled race conditions or thread safety?',
    source_primitive: 'p4',
    evaluation_criteria: 'Should demonstrate understanding of locks, atomic operations, or message passing patterns.',
  },
  {
    type: 'problem_solving',
    question: 'I noticed most of your PRs are relatively small — walk me through how you approach debugging a production issue with limited observability.',
    source_primitive: 'p1',
    evaluation_criteria: 'Should articulate a systematic debugging approach and mention specific tools or techniques.',
  },
  {
    type: 'team_collaboration',
    question: 'Your review comments are primarily LGTM-style — how do you typically handle code reviews for changes in areas you are unfamiliar with?',
    source_primitive: 'p3',
    evaluation_criteria: 'Should describe a process for learning unfamiliar code and providing meaningful feedback.',
  },
  {
    type: 'technical_judgment',
    question: 'Given your experience with both Python and TypeScript, how would you decide which technology to use for a new data processing service?',
    source_primitive: 'p2',
    evaluation_criteria: 'Should reference trade-offs around type safety, ecosystem, team expertise, and operational requirements.',
  },
]);

/** Expected parsed interview questions */
export const VALID_INTERVIEW_PARSED: InterviewQuestion[] = [
  {
    type: 'experience_depth',
    question: 'Your commit history shows limited work in concurrency — can you describe a time you handled race conditions or thread safety?',
    source_primitive: 'p4',
    evaluation_criteria: 'Should demonstrate understanding of locks, atomic operations, or message passing patterns.',
  },
  {
    type: 'problem_solving',
    question: 'I noticed most of your PRs are relatively small — walk me through how you approach debugging a production issue with limited observability.',
    source_primitive: 'p1',
    evaluation_criteria: 'Should articulate a systematic debugging approach and mention specific tools or techniques.',
  },
  {
    type: 'team_collaboration',
    question: 'Your review comments are primarily LGTM-style — how do you typically handle code reviews for changes in areas you are unfamiliar with?',
    source_primitive: 'p3',
    evaluation_criteria: 'Should describe a process for learning unfamiliar code and providing meaningful feedback.',
  },
  {
    type: 'technical_judgment',
    question: 'Given your experience with both Python and TypeScript, how would you decide which technology to use for a new data processing service?',
    source_primitive: 'p2',
    evaluation_criteria: 'Should reference trade-offs around type safety, ecosystem, team expertise, and operational requirements.',
  },
];