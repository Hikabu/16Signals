import {
  Controller,
  Post,
  Get,
  Body,
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
} from './contract/scorecard.dto';
import {
  ApiTags,
  ApiOperation,
  ApiHeader,
  ApiBearerAuth,
  ApiParam,
  ApiBody,
  ApiOkResponse,
  ApiNotFoundResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { VerifiedAuth } from '../../shared/decorators/verified.decorator';
import { PrismaService } from 'src/prisma/prisma.service';
/**
 * Request DTOs
 */
class PreviewScorecardRequestDto {
  githubUsername: string;
}

/**
 * Standard Error DTO
 */
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

  /**
   * ----------------------------------------
   * INTERNAL MOCK PREVIEW (UI MODEL)
   * ----------------------------------------
   */
  @Post('mock/preview')
  @ApiOperation({
    summary: 'Preview scorecard (UI model)',
    description:
      'Generates a mock scorecard for a given GitHub username and returns a frontend-ready UI model. Requires internal API key.',
  })
  
  @ApiBody({
    type: PreviewScorecardRequestDto,
    examples: {
      example1: {
        summary: 'Basic request',
        value: {
          githubUsername: 'octocat',
        },
      },
    },
  })
  @ApiOkResponse({
    description: 'Successfully generated UI scorecard',
    type: ScorecardUiDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid internal API key',
    type: ScorecardErrorResponseDto,
  })
  @ApiHeader({
    name: 'X-Internal-Key',
    description: 'Internal API key (required)',
    required: true,
  })
  @UseGuards(InternalKeyGuard)
  @HttpCode(HttpStatus.OK)
  @ZodResponse({ status: 200, type: ScorecardUiDto })
  async preview(
    @Body() request: PreviewScorecardRequestDto,
  ): Promise<ScorecardUiDto> {
    const result = await this.scorecardService.previewForUsername(
      request.githubUsername,
    );

    const scoreResult = await this.scorecardService.mapToUiModel(result);
    return scoreResult;
  }

  /**
   * ----------------------------------------
   * INTERNAL MOCK PREVIEW (RAW MODEL)
   * ----------------------------------------
   */
  @Post('mock/preview/raw')
  @ApiOperation({
    summary: 'Preview scorecard (raw model)',
    description:
      'Returns full raw scoring data for debugging and internal analysis. Not intended for frontend usage.',
  })
  @ApiHeader({
    name: 'X-Internal-Key',
    description: 'Internal API key (required)',
    required: true,
  })
  @ApiBody({
    type: PreviewScorecardRequestDto,
  })
  @ApiOkResponse({
    description: 'Raw scorecard data',
    type: ScorecardRawResponseDto,
  })
  @UseGuards(InternalKeyGuard)
  @HttpCode(HttpStatus.OK)
  @ZodResponse({ status: 200, type: ScorecardRawResponseDto })
  async previewRaw(@Body() request: PreviewScorecardRequestDto): Promise<any> {
    return this.scorecardService.previewForUsername(request.githubUsername);
  }

  /**
   * ----------------------------------------
   * AUTHENTICATED USER SCORECARD (UI)
   * ----------------------------------------
   */
  @Get('me')
  @VerifiedAuth()
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get my scorecard (UI)',
    description:
      'Returns the authenticated user’s scorecard formatted for frontend display.',
  })
  @ApiOkResponse({
    description: 'User scorecard',
    type: ScorecardUiDto,
  })
  @ApiNotFoundResponse({
    description: 'No scorecard found. User must trigger GitHub sync first.',
    type: ScorecardErrorResponseDto,
  })
  async getMyScorecard(@Request() req) {
    const scorecard = await this.scorecardService.getScorecardForUser(
      {userId: req.user.id},
    );

    console.log("scorecard? ", scorecard!!);
    if (!scorecard) {
      throw new NotFoundException(
        'No scorecard found. Trigger a sync first via POST /me/github/sync',
      );
    }

    const result = await this.scorecardService.mapToUiModel(scorecard, {userId: req.user.id});
    return result;
  }
/**
 * ----------------------------------------
 * PUBLIC SCORECARD BY APP USERNAME
 * ----------------------------------------
 *
 * Example:
 * GET /scorecards/user/arturo
 *
 * Flow:
 * app username -> linked github username -> cached scorecard
 */
@Get('user/:username')
@ApiOperation({
  summary: 'Get public scorecard by app username',
  description:
    'Fetch a public scorecard using a registered platform username.',
})
@ApiParam({
  name: 'username',
  type: String,
  example: 'arturo',
  description: 'Registered platform username',
})
@ApiOkResponse({
  description: 'Public scorecard',
  type: ScorecardUiDto,
})
@ApiNotFoundResponse({
  description: 'User or scorecard not found',
  type: ScorecardErrorResponseDto,
})
async getPublicUserScorecard(
  @Param('username') username: string,
) {
     const scorecard = await this.scorecardService.getScorecardForUser(
      {username}
    );

    console.log("scorecard? ", scorecard!!);
    if (!scorecard) {
      throw new NotFoundException(
        'No scorecard found. Trigger a sync first via POST /me/github/sync',
      );
    }

    const result = await this.scorecardService.mapToUiModel(scorecard, {username});
    return result;
}

/**
 * ----------------------------------------
 * PUBLIC SCORECARD BY GITHUB USERNAME
 * ----------------------------------------
 *
 * Example:
 * GET /scorecards/github/octocat
 *
 * Flow:
 * github username -> cached scorecard
 */
@Get('github/:githubUsername')
@ApiOperation({
  summary: 'Get public scorecard by GitHub username',
  description:
    'Fetch a public scorecard directly from a GitHub username.',
})
@ApiParam({
  name: 'githubUsername',
  type: String,
  example: 'octocat',
  description: 'GitHub username',
})
@ApiOkResponse({
  description: 'Public scorecard',
  type: ScorecardUiDto,
})
@ApiNotFoundResponse({
  description: 'No cached scorecard found',
  type: ScorecardErrorResponseDto,
})
async getPublicScorecardByGithub(
  @Param('githubUsername') githubUsername: string,
) {
  const scorecard =
    await this.scorecardService.getScorecardFromCache(
      githubUsername,
    );

  if (!scorecard) {
    throw new NotFoundException(
      `No cached scorecard found for GitHub user "${githubUsername}".`,
    );
  }

  /**
   * Optional:
   * try finding linked platform user
   */
  const linkedUser = await this.prisma.user.findFirst({
    where: {
      candidate: {
        devProfile: {
          githubProfile: {
            githubUsername,
          },
        },
      },
    },
    select: {
      id: true,
    },
  });

  return this.scorecardService.mapToUiModel(
    scorecard,
    {userId: linkedUser?.id},
  );
}
  /**
   * ----------------------------------------
   * AUTHENTICATED USER SCORECARD (RAW)
   * ----------------------------------------
   */
  @Get('me/raw')
  @VerifiedAuth()
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get my scorecard (raw)',
    description:
      'Returns raw internal scorecard data for the authenticated user.',
  })
  @ApiOkResponse({
    description: 'Raw scorecard',
    type: ScorecardRawResponseDto,
  })
  async getMyScorecardRaw(@Request() req) {
    const scorecard = await this.scorecardService.getScorecardForUser(
      req.user.id,
    );

    if (!scorecard) {
      throw new NotFoundException(
        'No scorecard found. Trigger a sync first via POST /me/github/sync',
      );
    }

    return scorecard;
  }

  /**
   * ----------------------------------------
   * PUBLIC SCORECARD (RAW)
   * ----------------------------------------
   */
  @Get(':username/raw')
  @ApiOperation({
    summary: 'Get public scorecard (raw)',
    description:
      'Returns raw cached scorecard for debugging or internal usage.',
  })
  @ApiParam({
    name: 'username',
    example: 'octocat',
  })
  @ApiOkResponse({
    description: 'Raw scorecard',
    type: ScorecardRawResponseDto,
  })
  async getPublicScorecardRaw(@Param('username') username: string) {
    const scorecard =
      await this.scorecardService.getScorecardFromCache(username);

    if (!scorecard) {
      throw new NotFoundException(`No cached scorecard for ${username}`);
    }

    return scorecard;
  }
}
