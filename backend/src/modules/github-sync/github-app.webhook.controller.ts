import {
  Controller,
  Post,
  Get,
  Delete,
  Req,
  Res,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  UseGuards,
  Query,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiTags,
  ApiOperation,
  ApiExcludeEndpoint,
  ApiBearerAuth,
  ApiOkResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { GitHubAppService } from './github-app.service';
import { PrismaService } from '../../prisma/prisma.service';

@ApiTags('GitHub App')
@Controller('sync/github/app')
export class GitHubAppWebhookController {
  private readonly logger = new Logger(GitHubAppWebhookController.name);

  constructor(
    private readonly gitHubAppService: GitHubAppService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  // ── Webhook receiver (called by GitHub) ──────────────────────

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  async handleWebhook(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('X-GitHub-Event') event: string,
    @Headers('X-Hub-Signature-256') signature: string,
  ) {
    const payload = req.body;
    this.logger.log(
      `Webhook received: event=${event} action=${payload?.action ?? 'none'} ` +
        `installationId=${payload?.installation?.id ?? 'none'}`,
    );

    const rawBody = req.rawBody;

    if (!rawBody) {
      throw new Error('Raw body missing');
    }
    if (!this.gitHubAppService.verifySignature(rawBody, signature)) {
      this.logger.warn('Webhook signature verification failed');
      return { error: 'Invalid signature' };
    }
    const result = await this.gitHubAppService.handleWebhookEvent(
      event,
      payload,
    );
    this.logger.log(
      `Webhook processed: handled=${result.handled} event=${result.event} message=${result.message}`,
    );
    return result;
  }

  // ── Install redirect (backend redirect like Google OAuth) ────

  @Get('install')
  @ApiOperation({
    summary: 'Redirect to GitHub App installation page',
    description:
      'Redirects the authenticated candidate to the GitHub App installation page.',
  })
  @ApiOkResponse({ description: 'Redirects to GitHub' })
  async redirectToInstall(@Req() req: any, @Res() res: Response) {
    const appName =
      this.config.get<string>('GITHUB_ANALYSIS_NAME') || '16signals-analysis';
    const url = `https://github.com/apps/${appName}/installations/new`;
    this.logger.log(
      `Redirecting user ${req.user?.id} to GitHub App install: ${url}`,
    );
    return res.redirect(url);
  }

  // ── Installation status check ─────────────────────────────────

  @Get('me/status')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Check GitHub App installation status',
    description:
      'Returns whether the authenticated candidate has installed the GitHub App.',
  })
  @ApiOkResponse({
    description: 'Installation status',
    schema: {
      type: 'object',
      properties: {
        installed: { type: 'boolean', example: true },
        installationId: { type: 'string', example: '12345678' },
        githubUsername: { type: 'string', example: 'candidate' },
      },
    },
  })
  async getCandidateStatus(@Req() req: any) {
    const userId = req.user?.id;
    if (!userId) {
      return { installed: false, error: 'Not authenticated' };
    }
    const result = await this.gitHubAppService.getInstallationStatus(userId);
    return result;
  }

  @Get('public/status')
  @ApiOperation({
    summary: 'Check GitHub App installation status',
    description: 'Returns whether a GitHub user has installed the GitHub App.',
  })
  @ApiQuery({
    name: 'githubUsername',
    required: true,
    type: String,
    example: 'candidate',
  })
  @ApiOkResponse({
    description: 'Installation status',
    schema: {
      type: 'object',
      properties: {
        installed: { type: 'boolean', example: true },
        installationId: { type: 'string', example: '12345678' },
        githubUsername: { type: 'string', example: 'candidate' },
      },
    },
  })
  async getPublicStatus(@Query('githubUsername') githubUsername: string) {
    return this.gitHubAppService.getInstallationStatusByUsername(
      githubUsername,
    );
  }

  // ── Manual installation verification (recovery) ──────────────

  @Post('verify')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Verify and link GitHub App installation',
    description:
      'Uses the GitHub App JWT to list installations for the authenticated user. ' +
      'If found, stores the installationId on GithubProfile. ' +
      'Use this if the webhook was missed.',
  })
  @ApiOkResponse({
    description: 'Verification result',
    schema: {
      type: 'object',
      properties: {
        linked: { type: 'boolean', example: true },
        installationId: { type: 'string', example: '12345678' },
        message: { type: 'string' },
      },
    },
  })
  async verify(@Req() req: any) {
    const userId = req.user?.id;
    if (!userId) {
      return { linked: false, message: 'Not authenticated' };
    }
    const result = await this.gitHubAppService.verifyInstallation(userId);
    return result;
  }

  // ── Manual uninstall (cleanup) ────────────────────────────────

  @Delete('uninstall')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Clear GitHub App installation',
    description:
      "Manually clears the installationId from the authenticated user's GithubProfile.",
  })
  async uninstall(@Req() req: any) {
    const userId = req.user?.id;
    if (!userId) {
      return { ok: false, message: 'Not authenticated' };
    }
    const result = await this.gitHubAppService.uninstall(userId);
    return result;
  }
}
