import { Controller, Post, Get, Req, Headers, HttpCode, HttpStatus, Logger } from '@nestjs/common';
import { Request } from 'express';
import { ApiTags, ApiOperation, ApiExcludeEndpoint } from '@nestjs/swagger';
import { GitHubAppService } from './github-app.service';

@ApiTags('GitHub App')
@Controller('sync/github/app')
export class GitHubAppWebhookController {
  private readonly logger = new Logger(GitHubAppWebhookController.name);

  constructor(private readonly gitHubAppService: GitHubAppService) {}

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  async handleWebhook(
    @Req() req: Request,
    @Headers('X-GitHub-Event') event: string,
    @Headers('X-Hub-Signature-256') signature: string,
  ) {
    const payload = req.body;
    this.logger.log(
      `Webhook received: event=${event} action=${payload?.action ?? 'none'} ` +
      `installationId=${payload?.installation?.id ?? 'none'}`,
    );
    const rawBody = JSON.stringify(payload);
    if (!this.gitHubAppService.verifySignature(rawBody, signature)) {
      this.logger.warn('Webhook signature verification failed');
      return { error: 'Invalid signature' };
    }
    const result = await this.gitHubAppService.handleWebhookEvent(event, payload);
    this.logger.log(
      `Webhook processed: handled=${result.handled} event=${result.event} message=${result.message}`,
    );
    return result;
  }

  @Get('install')
  @ApiOperation({
    summary: 'Get GitHub App installation URL',
    description: 'Returns the URL where candidates can install the 16Signals GitHub App.',
  })
  async getInstallUrl() {
    const appName = process.env.GITHUB_APP_NAME || '16signals-analysis';
    return {
      url: `https://github.com/apps/${appName}/installations/new`,
      message: 'Install the 16Signals GitHub App to enable Deep Mode with private repository access.',
    };
  }
}
