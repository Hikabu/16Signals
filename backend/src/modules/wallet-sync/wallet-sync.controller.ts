import { Controller, Get, Post, Body, UseGuards, Req, Delete } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
  ApiNotFoundResponse,
  ApiBody,
  ApiHeader,
} from '@nestjs/swagger';

import { WalletSyncService } from './wallet-sync.service';
import {
  ChallengeResponseDto,
  LinkWalletRequestDto,
  LinkWalletResponseDto,
  WalletSyncErrorResponseDto,
} from './dto/wallet-sync.dto';
import { InternalKeyGuard } from '../scorecard/internal-key.guard';

@ApiTags('Wallet Sync')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('sync/wallet')
export class WalletSyncController {
  constructor(private readonly walletSyncService: WalletSyncService) {}

  /**
   * Generate wallet linking challenge
   */
  @Get('challenge')
  @ApiOperation({
    summary: 'Generate wallet linking challenge',
    description:
      'Creates a time-limited cryptographic challenge used to verify wallet ownership before linking a Solana wallet to the user account. Flow [server gives you a challenge-message >>> wallet signs challenge-message >>> server verifies signature match for challenge-message] This is step 1 in the flow ',
  })
  @ApiOkResponse({
    description: 'Challenge successfully generated',
    type: ChallengeResponseDto,
    example: {
      challenge: 'link-wallet:user123:1713940000000:a1b2c3',
    },
  })
  @ApiUnauthorizedResponse({
    description: 'User is not authenticated',
    type: WalletSyncErrorResponseDto,
    example: {
      statusCode: 401,
      message: 'Unauthorized',
      error: 'Unauthorized',
    },
  })
  async getChallenge(@Req() req: any): Promise<ChallengeResponseDto> {
    const challenge = await this.walletSyncService.generateChallenge(
      req.user.id,
    );
    console.log("Generated challenge for user", req.user.id, "challenge:", challenge);

    return { challenge };
  }

  /**
   * Link Solana wallet to authenticated user
   */
  @Post()
  @ApiOperation({
    summary: 'Verify wallet signature and link wallet',
    description:
      'Verifies a Solana wallet signature against a previously generated challenge and links the wallet to the authenticated user account.',
  })
  @ApiBody({
    type: LinkWalletRequestDto,
    description: 'Wallet address and cryptographic signature',
    examples: {
      example1: {
        summary: 'Valid request example',
        value: {
          walletAddress: '7Gg3...SolanaAddressExample...',
          signature: '5hK9...Base58Signature...',
          message: 'link-wallet:user123:1713940000000:a1b2c3',
        },
      },
    },
  })
  @ApiOkResponse({
    description: 'Wallet successfully linked',
    type: LinkWalletResponseDto,
    example: {
      linked: true,
      solanaAddress: '7Gg3...SolanaAddressExample...',
    },
  })
  @ApiBadRequestResponse({
    description: 'Invalid wallet address format',
    type: WalletSyncErrorResponseDto,
    example: {
      statusCode: 400,
      message: 'Invalid Solana wallet address',
      error: 'Bad Request',
    },
  })
  @ApiNotFoundResponse({
    description: 'Challenge expired or candidate profile missing',
    type: WalletSyncErrorResponseDto,
    example: {
      statusCode: 404,
      message: 'Challenge expired or not found',
      error: 'Not Found',
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Signature verification failed',
    type: WalletSyncErrorResponseDto,
    example: {
      statusCode: 401,
      message: 'Wallet signature invalid',
      error: 'Unauthorized',
    },
  })
  async linkWallet(
    @Req() req: any,
    @Body() body: LinkWalletRequestDto,
  ): Promise<LinkWalletResponseDto> {
    console.log("Link wallet request for user", req.user.id, "walletAddress:", body.walletAddress);
    console.log("Link wallet request for user", req.user.id, "message:", body.message);
    console.log("Link wallet request for user", req.user.id, "signature:", body.signature);
    return this.walletSyncService.linkWallet(
      req.user.id,
      body.walletAddress,
      body.signature,
      body.message,
    );
  }

  @Delete('unsync')
@ApiOperation({
  summary: 'DEV ONLY - unlink wallet',
})
@ApiHeader({
      name: 'X-Internal-Key',
      description: 'Internal API key (required)',
      required: true,
    })
  @UseGuards(InternalKeyGuard)
async unsyncWallet(@Req() req: any) {
  return this.walletSyncService.unsyncWallet(req.user.id)
}
}
