import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  UseGuards,
  HttpCode,
  Request,
  HttpStatus,
  NotFoundException,
  Param,
} from '@nestjs/common';
import { ScorecardService } from './scorecard.service';
import { InternalKeyGuard } from './internal-key.guard';
import { ZodResponse } from 'nestjs-zod';
import {
  ScorecardUiDto,
  ScorecardRawResponseDto,
  ScorecardPreviewRequestDto,
} from './contract/scorecard.dto';
import {
  ApiTags,
  ApiOperation,
  ApiHeader,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
  ApiBody,
  ApiOkResponse,
  ApiNotFoundResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { VerifiedAuth } from '../../shared/decorators/verified.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { ScorecardViewType, RequestedMode } from './scorecard.types';

class ScorecardErrorResponseDto {
  statusCode: number;
  message: string;
  error: string;
}

@ApiTags('Scorecard')
@Controller('api/scorecard')
export class ScorecardController {
  constructor(
    private readonly scorecardService: ScorecardService,
    private readonly prisma: PrismaService,
  ) {}

  // ═══════════════════════════════════════════════════════════════════
  // INTERNAL MOCK PREVIEW (UI MODEL)
  // ═══════════════════════════════════════════════════════════════════

  @Post('mock/preview')
  @ApiOperation({
    summary: '[INTERNAL] Preview scorecard (UI model)',
    description:
      'Generates a view-based scorecard for a given GitHub username. ' +
      'Supports ?view=snapshot|recruiter|deep|public|raw and ?mode=light|deep.',
  })
  @ApiBody({ type: ScorecardPreviewRequestDto })
  @ApiQuery({ name: 'view', required: false, enum: ['snapshot', 'recruiter', 'deep', 'public', 'raw'] })
  @ApiQuery({ name: 'mode', required: false, enum: ['light', 'deep'] })
  @ApiOkResponse({ description: 'Successfully generated UI scorecard', type: ScorecardUiDto })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid internal API key', type: ScorecardErrorResponseDto })
  @ApiHeader({ name: 'X-Internal-Key', description: 'Internal API key (required)', required: true })
  @UseGuards(InternalKeyGuard)
  @HttpCode(HttpStatus.OK)
  @ZodResponse({ status: 200, type: ScorecardUiDto })
  async preview(
    @Body() request: ScorecardPreviewRequestDto,
    @Query('view') view?: ScorecardViewType,
    @Query('mode') mode?: RequestedMode,
  ): Promise<any> {
    const result = await this.scorecardService.getScorecardForGithubUser(
      request.githubUsername,
      { mode, view },
    );
    if (!result) {
      throw new NotFoundException(
        `No scorecard found for GitHub user "${request.githubUsername}".`,
      );
    }
    return result;
  }

  // ═══════════════════════════════════════════════════════════════════
  // INTERNAL MOCK PREVIEW (RAW MODEL)
  // ═══════════════════════════════════════════════════════════════════

  @Post('mock/preview/raw')
  @ApiOperation({ summary: '[INTERNAL] Preview scorecard (raw model)' })
  @ApiHeader({ name: 'X-Internal-Key', description: 'Internal API key (required)', required: true })
  @ApiBody({ type: ScorecardPreviewRequestDto })
  @ApiOkResponse({ description: 'Raw scorecard data', type: ScorecardRawResponseDto })
  @UseGuards(InternalKeyGuard)
  @HttpCode(HttpStatus.OK)
  @ZodResponse({ status: 200, type: ScorecardRawResponseDto })
  async previewRaw(@Body() request: ScorecardPreviewRequestDto): Promise<any> {
    const scorecard = await this.scorecardService.getRawScorecard(request.githubUsername);
    if (!scorecard) throw new NotFoundException(`No cached scorecard for ${request.githubUsername}`);
    return scorecard;
  }

  // ═══════════════════════════════════════════════════════════════════
  // AUTHENTICATED USER SCORECARD (UI)
  // ═══════════════════════════════════════════════════════════════════

  @Get('me')
  @VerifiedAuth()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get my scorecard (view-based)' })
  @ApiQuery({ name: 'view', required: false, enum: ['snapshot', 'recruiter', 'deep', 'public', 'raw'] })
  @ApiQuery({ name: 'mode', required: false, enum: ['light', 'deep'] })
  @ApiOkResponse({ description: 'User scorecard', type: ScorecardUiDto })
  @ApiNotFoundResponse({ description: 'No scorecard found', type: ScorecardErrorResponseDto })
  async getMyScorecard(
    @Request() req,
    @Query('view') view?: ScorecardViewType,
    @Query('mode') mode?: RequestedMode,
  ) {
    const result = await this.scorecardService.getScorecardForUser(req.user.id, { mode, view });
    if (!result) throw new NotFoundException('No scorecard found. An analysis must be completed first.');
    return result;
  }

  // ═══════════════════════════════════════════════════════════════════
  // PUBLIC SCORECARD BY APP USERNAME
  // ═══════════════════════════════════════════════════════════════════

  @Get('user/:username')
  @ApiOperation({ summary: 'Get public scorecard by app username' })
  @ApiParam({ name: 'username', type: String, example: 'arturo' })
  @ApiQuery({ name: 'view', required: false, enum: ['snapshot', 'recruiter', 'deep', 'public', 'raw'] })
  @ApiQuery({ name: 'mode', required: false, enum: ['light', 'deep'] })
  @ApiOkResponse({ description: 'Public scorecard', type: ScorecardUiDto })
  @ApiNotFoundResponse({ description: 'User or scorecard not found', type: ScorecardErrorResponseDto })
  async getPublicUserScorecard(
    @Param('username') username: string,
    @Query('view') view?: ScorecardViewType,
    @Query('mode') mode?: RequestedMode,
  ) {
    const user = await this.prisma.user.findUnique({ where: { username }, select: { id: true } });
    if (!user) throw new NotFoundException(`User "${username}" not found.`);
    const result = await this.scorecardService.getScorecardForUser(user.id, { mode, view });
    if (!result) throw new NotFoundException(`No scorecard found for user "${username}".`);
    return result;
  }

  // ═══════════════════════════════════════════════════════════════════
  // RAW ENDPOINTS — MUST be registered BEFORE generic github/:githubUsername
  // to avoid Express matching ':githubUsername' = 'raw'
  // ═══════════════════════════════════════════════════════════════════

  @Get('github/:githubUsername/raw')
  @ApiOperation({ summary: 'Get raw scorecard by GitHub username (debug)' })
  @ApiParam({ name: 'githubUsername', example: 'octocat' })
  @ApiOkResponse({ description: 'Raw scorecard', type: ScorecardRawResponseDto })
  async getPublicScorecardRaw(@Param('githubUsername') githubUsername: string) {
    const scorecard = await this.scorecardService.getRawScorecard(githubUsername);
    if (!scorecard) throw new NotFoundException(`No cached scorecard for ${githubUsername}`);
    return scorecard;
  }

  // ═══════════════════════════════════════════════════════════════════
  // PUBLIC SCORECARD BY GITHUB USERNAME
  // ═══════════════════════════════════════════════════════════════════

  @Get('github/:githubUsername')
  @ApiOperation({ summary: 'Get scorecard by GitHub username' })
  @ApiParam({ name: 'githubUsername', type: String, example: 'octocat', description: 'GitHub username' })
  @ApiQuery({ name: 'view', required: false, enum: ['snapshot', 'recruiter', 'deep', 'public', 'raw'] })
  @ApiQuery({ name: 'mode', required: false, enum: ['light', 'deep'] })
  @ApiOkResponse({ description: 'Scorecard', type: ScorecardUiDto })
  @ApiNotFoundResponse({ description: 'No cached scorecard found', type: ScorecardErrorResponseDto })
  async getPublicScorecardByGithub(
    @Param('githubUsername') githubUsername: string,
    @Query('view') view?: ScorecardViewType,
    @Query('mode') mode?: RequestedMode,
  ) {
    const result = await this.scorecardService.getScorecardForGithubUser(githubUsername, { mode, view });
    if (!result) throw new NotFoundException(`No scorecard found for GitHub user "${githubUsername}".`);
    return result;
  }

  // ═══════════════════════════════════════════════════════════════════
  // AUTHENTICATED USER SCORECARD (RAW)
  // ═══════════════════════════════════════════════════════════════════

  @Get('me/raw')
  @VerifiedAuth()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get my scorecard (raw debug)' })
  @ApiOkResponse({ description: 'Raw scorecard', type: ScorecardRawResponseDto })
  async getMyScorecardRaw(@Request() req) {
    const candidate = await this.prisma.candidate.findUnique({
      where: { userId: req.user.id },
      select: { devProfile: { select: { githubProfile: { select: { githubUsername: true } } } } },
    });
    const githubUsername = candidate?.devProfile?.githubProfile?.githubUsername;
    if (!githubUsername) throw new NotFoundException('No GitHub profile linked.');
    const scorecard = await this.scorecardService.getRawScorecard(githubUsername);
    if (!scorecard) throw new NotFoundException('No scorecard found.');
    return scorecard;
  }
}