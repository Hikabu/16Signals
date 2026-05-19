import {
  Controller,
  Post,
  Get,
  Req,
  Res,
  UseGuards,
  Query,
  Delete,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiOkResponse,
  ApiUnauthorizedResponse,
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiQuery,
  ApiHeader,
} from '@nestjs/swagger';

import { GithubSyncService } from './github-sync.service';
import { GithubSyncConnectGuard } from '../auth-candidate/guards/github.sync.connect.guard';
import { InternalKeyGuard } from '../scorecard/internal-key.guard';


@ApiTags('GitHub Sync')
@Controller('sync/github')
export class GithubSyncController {
  constructor(private readonly githubSyncService: GithubSyncService) {}

  // ─────────────────────────────────────────────
  // CONNECT FLOW (Step 1)
  // ─────────────────────────────────────────────

  @Get('connect')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Start GitHub connection',
    description:
      'Generates a GitHub OAuth URL for the authenticated user and redirects them to GitHub authorization.',
  })
  @ApiOkResponse({
    description: 'Redirects user to GitHub OAuth consent screen',
  })
  async startConnect(@Req() req: any, @Res() res: Response) {
    const url = await this.githubSyncService.startConnect(req.user.id);
    return res.redirect(url);
  }

  // ─────────────────────────────────────────────
  // CONNECT CALLBACK (Step 2)
  // ─────────────────────────────────────────────

  @Get('connect/callback')
  @UseGuards(GithubSyncConnectGuard)
  @ApiOperation({
    summary: 'GitHub OAuth callback (connect flow)',
    description:
      'Handles GitHub OAuth callback and links GitHub account to the user profile, then triggers initial sync.',
  })
  @ApiQuery({
    name: 'state',
    required: true,
    description: 'OAuth state parameter used for CSRF protection',
    example: '9f8a3c2d1b...',
  })
  @ApiOkResponse({
    description: 'Redirects user to frontend sync progress page',
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid or expired OAuth state',
  })
  async connectCallback(
    @Req() req: any,
    @Res() res: Response,
    @Query('state') state: string,
  ) {
    await this.githubSyncService.connectGithub(req.user, state);
return res.redirect(`${process.env.FRONTEND_URL}/sync/github/callback`);
 }

  // ─────────────────────────────────────────────
  // TRIGGER SYNC
  // ─────────────────────────────────────────────

  @Post()
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Sync Github before scorecard generation',
    description:
      'Manually triggers a sync of GitHub data for the authenticated user. Requires GitHub to be connected. This step is required before generating a scorecard for a signed in user',
  })
  @ApiOkResponse({
    description: 'Sync job successfully queued or executed',
  })
  @ApiConflictResponse({
    description:
      'GitHub account not connected. Frontend should redirect to connect flow.',
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid or missing JWT token',
  })
  async triggerSync(@Req() req: any) {
    return this.githubSyncService.triggerSync(req.user.id);
  }

  // ─────────────────────────────────────────────
  // SYNC STATUS
  // ─────────────────────────────────────────────

  @Get('status')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get GitHub sync status',
    description:
      'Returns current sync state including progress, errors, and last sync timestamp.',
  })
  @ApiOkResponse({
    description: 'Current sync status retrieved successfully',
  })
  async getSyncStatus(@Req() req: any) {

    return this.githubSyncService.getSyncStatus(req.user.id);
  }


///ONLY TESTING - DELETE TODO
  @Delete('dev/unsync')
@UseGuards(AuthGuard('jwt'), InternalKeyGuard)
@ApiHeader({
    name: 'X-Internal-Key',
    description: 'Internal API key (required)',
    required: true,
  })
async unsyncGithub(@Req() req: any) {
  
  return this.githubSyncService.unsyncGithub(req.user.id);
}
}
