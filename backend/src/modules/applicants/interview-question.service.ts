import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
// import { GoogleGenAI } from '@google/generative-ai';
import { PipelineStage } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface InterviewQuestion {
  question: string;
  rationale: string;
  dimension: string;
  priority: 'MUST_ASK' | 'SHOULD_ASK' | 'NICE_TO_HAVE';
}

export interface InterviewQuestionSet {
  stage: PipelineStage;
  audienceType: 'hr' | 'technical' | 'final';
  questions: InterviewQuestion[];
  generatedAt: Date;
}

@Injectable()
export class InterviewQuestionService {
  private readonly ai: GoogleGenAI;
  private readonly logger = new Logger(InterviewQuestionService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const apiKey = this.configService.get<string>('GOOGLE_AI_API_KEY');

    if (!apiKey) {
      throw new Error('Missing GOOGLE_AI_API_KEY');
    }

    this.ai = new GoogleGenAI({ apiKey });
  }

  async generateForApplication(appId: string, targetStage: PipelineStage) {
    try {
      const app = await this.prisma.shortlist.findUnique({
        where: { id: appId },
        include: {
          jobPost: true,
          candidate: { include: { user: true } },
        },
      });

      if (!app) return;

      const generatedSet = await this.generate(app, targetStage);

      // Sort questions by priority
      const priorityOrder = { MUST_ASK: 1, SHOULD_ASK: 2, NICE_TO_HAVE: 3 };
      generatedSet.questions.sort(
        (a, b) => priorityOrder[a.priority] - priorityOrder[b.priority],
      );

      const existingQuestions = (app.interviewQuestions as any[]) || [];

      await this.prisma.shortlist.update({
        where: { id: appId },
        data: {
          interviewQuestions: [...existingQuestions, generatedSet],
        },
      });

      this.logger.log(`Generated and saved questions for ${appId}`);
    } catch (error) {
      this.logger.error(`Failed to generate/save questions: ${error.message}`);
    }
  }

  async generate(
    application: any,
    targetStage: PipelineStage,
  ): Promise<InterviewQuestionSet> {
    let audienceType: 'hr' | 'technical' | 'final';
    let systemPrompt = '';

    if (targetStage === PipelineStage.INTERVIEW_HR) {
      audienceType = 'hr';
      systemPrompt = 'You are an HR interviewer.';
    } else if (targetStage === PipelineStage.INTERVIEW_FINAL) {
      audienceType = 'final';
      systemPrompt = 'You are preparing a final-round interview.';
    } else {
      audienceType = 'technical';
      systemPrompt =
        'You are a senior engineer conducting a technical interview.';
    }

    const {
      decisionCard = {},
      gapReport = {},
      frozenScorecard = {},
    } = application;

    const payload = JSON.stringify({
      verdict: decisionCard.verdict,
      gaps: gapReport.gaps || [],
      strengths: decisionCard.strengths || [],
      risks: decisionCard.risks || [],
      scorecard: {
        summary: frozenScorecard.summary,
        capabilities: frozenScorecard.capabilities,
        ownership: frozenScorecard.ownership,
        impact: frozenScorecard.impact,
        reputation: frozenScorecard.reputation,
        privateWorkNote: frozenScorecard.privateWorkNote,
        stack: frozenScorecard.stack,
        web3: frozenScorecard.web3,
      },
    });

    const prompt = `
${systemPrompt}

Generate 5 interview questions.

Return ONLY valid JSON (no markdown, no explanation) in this exact format:
[
  {
    "question": string,
    "rationale": string,
    "dimension": string,
    "priority": "MUST_ASK" | "SHOULD_ASK" | "NICE_TO_HAVE"
  }
]

Rules:
- MUST_ASK = critical gaps or risks
- SHOULD_ASK = important but not blocking
- NICE_TO_HAVE = bonus insights
- Keep questions concise and specific

Candidate Data:
${payload}
`;

    try {
      const result = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });

      const raw = result.text ?? '';

      // 🔥 Clean response
      const cleaned = raw
        .replace(/```json/g, '')
        .replace(/```/g, '')
        .trim();

      if (!cleaned) {
        throw new Error('Empty AI response');
      }

      let parsed: InterviewQuestion[];

      try {
        parsed = JSON.parse(cleaned);
      } catch {
        this.logger.error('Bad JSON from Gemini:', raw);
        throw new Error('Invalid JSON');
      }

      // ✅ Normalize priorities (bulletproof)
      parsed = parsed.map((q) => ({
        ...q,
        priority: this.normalizePriority(q.priority),
      }));

      return {
        stage: targetStage,
        audienceType,
        questions: parsed,
        generatedAt: new Date(),
      };
    } catch (e: any) {
      this.logger.error(`Gemini API error: ${e.message}`);
      throw new InternalServerErrorException(
        'Failed to generate interview questions.',
      );
    }
  }

  private normalizePriority(p: string): InterviewQuestion['priority'] {
    const val = p?.toUpperCase();

    if (val?.includes('MUST')) return 'MUST_ASK';
    if (val?.includes('SHOULD')) return 'SHOULD_ASK';
    if (val?.includes('NICE')) return 'NICE_TO_HAVE';

    return 'SHOULD_ASK';
  }
}
