import {
  Controller,
  Delete,
  Param,
  Body,
  UseGuards,
  NotFoundException,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Headers,
  Res,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SkipThrottle } from '@nestjs/throttler';
import { Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiTags,
  ApiOperation,
  ApiBody,
  ApiParam,
  ApiResponse,
  ApiCreatedResponse,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
  ApiNotFoundResponse,
  ApiBearerAuth,
  ApiHeader,
} from '@nestjs/swagger';
import { VouchesService } from './vouches.service';
import { HeliusWebhookService } from './helius-webhook.service';
import { ConfirmVouchDto } from './dto/ConfirmVoucher.dto';
import { RevokeVouchDto } from './dto/RevokeVouch.dto';
import { VouchResponseDto } from './dto/VouchResponse.dto';
import { VoucherErrorResponseDto } from './dto/ErrorResponse.dto';
import { InternalKeyGuard } from '../scorecard/internal-key.guard';

@ApiTags('Vouches')
@Controller('vouch')
export class VouchesController {
  private readonly logger = new Logger(VouchesController.name);

  constructor(
    private readonly vouchesService: VouchesService,
    private readonly heliusWebhookService: HeliusWebhookService,
    private readonly config: ConfigService,
  ) {}

  @Post('confirm')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Confirm a vouch (on-chain verified endorsement)',
    description: `
  Creates and anchors a vouch for a candidate using a Solana transaction.
  
  This endpoint:
  - Verifies the transaction exists on-chain
  - Confirms the voucher wallet is the fee payer
  - Validates memo message matches the provided message
  - Enforces rules: no self-vouch, no duplicates, budget limits
  
  Authentication: JWT required. Uses the linked Solana wallet.
	  `,
  })
  @ApiBody({
    type: ConfirmVouchDto,
    description: 'Payload required to confirm a vouch',
  })
  @ApiCreatedResponse({
    description: 'Vouch successfully confirmed and stored',
    type: VouchResponseDto,
    examples: {
      verifiedVoucher: {
        summary: 'Successful vouch from a high-quality (verified) wallet',
        value: {
          id: 'vouch_123',
          candidateId: 'candidate_456',
          voucherWallet: '9xQeWvG816bUx9EP...',
          message: 'Great engineer, highly recommend',
          txSignature: '5Nf7...abc',
          weight: 'verified',
          isActive: true,
          confirmedAt: '2026-04-23T10:00:00.000Z',
          expiresAt: '2026-10-20T10:00:00.000Z',
        },
      },
      newWalletVoucher: {
        summary: 'Vouch created from a new wallet (lower trust weight)',
        value: {
          id: 'vouch_789',
          candidateId: 'candidate_456',
          voucherWallet: '7Gh3...xyz',
          message: 'Seems promising',
          txSignature: '8Abc...999',
          weight: 'new',
          isActive: true,
          confirmedAt: '2026-04-23T11:00:00.000Z',
          expiresAt: '2026-10-20T11:00:00.000Z',
        },
      },
    },
  })
  @ApiBadRequestResponse({
    description:
      'Validation error, duplicate vouch, self-vouch, budget exceeded, or invalid transaction',
    type: VoucherErrorResponseDto,
    examples: {
      duplicate: {
        summary: 'User already vouched for this candidate',
        value: {
          statusCode: 400,
          message: 'Already vouched for this candidate',
          error: 'Bad Request',
        },
      },
      selfVouch: {
        summary: 'User attempted to vouch for themselves',
        value: {
          statusCode: 400,
          message: 'Cannot vouch for yourself',
          error: 'Bad Request',
        },
      },
      invalidTx: {
        summary: 'Transaction failed verification',
        value: {
          statusCode: 400,
          message:
            'No Memo instruction found whose text matches the provided message',
          error: 'Bad Request',
        },
      },
    },
  })
  @ApiNotFoundResponse({
    description: 'Candidate not found',
    type: VoucherErrorResponseDto,
    examples: {
      notFound: {
        summary: 'Candidate does not exist',
        value: {
          statusCode: 404,
          message: 'Candidate not found for identifier: octocat',
          error: 'Not Found',
        },
      },
    },
  })
  async confirmVouch(@Req() req: any, @Body() body: ConfirmVouchDto) {
    // console.log('RAW BODY:', body);

    return this.vouchesService.confirmVouch(body, req.user.id);
  }

  @Delete(':id')
  @ApiHeader({
      name: 'X-Internal-Key',
      description: 'Internal API key (required)',
      required: true,
    })
  @UseGuards(AuthGuard('jwt'), InternalKeyGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Revoke a vouch',
    description: `
  Revokes an existing vouch.
  
  Authentication: JWT required. Uses the linked Solana wallet.
	  `,
  })
  @ApiParam({
    name: 'id',
    type: String,
    required: true,
    description: 'Unique identifier of the vouch',
    example: 'vouch_123',
  })
  @ApiBody({
    type: RevokeVouchDto,
    description: 'Wallet signature proof required to revoke a vouch',
  })
  @ApiResponse({
    status: 204,
    description: 'Vouch successfully revoked (no response body)',
  })
  @ApiBadRequestResponse({
    description: 'Malformed signature or already inactive vouch',
    type: VoucherErrorResponseDto,
    examples: {
      invalidSignatureFormat: {
        summary: 'Signature could not be decoded',
        value: {
          statusCode: 400,
          message: 'Signature decoding failed',
          error: 'Bad Request',
        },
      },
      alreadyInactive: {
        summary: 'Vouch already revoked',
        value: {
          statusCode: 400,
          message: 'Vouch is already inactive',
          error: 'Bad Request',
        },
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Signature verification failed',
    type: VoucherErrorResponseDto,
    examples: {
      invalidSignature: {
        summary: 'Wallet signature is invalid',
        value: {
          statusCode: 401,
          message: 'Invalid wallet signature',
          error: 'Unauthorized',
        },
      },
    },
  })
  @ApiNotFoundResponse({
    description: 'Vouch not found or wallet mismatch',
    type: VoucherErrorResponseDto,
    examples: {
      notFound: {
        summary: 'Vouch does not exist or does not belong to wallet',
        value: {
          statusCode: 404,
          message: 'Vouch not found or wallet mismatch',
          error: 'Not Found',
        },
      },
    },
  })
  async revokeVouch(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: RevokeVouchDto,
  ) {
    const walletAddress = req.user.web3Profile?.solanaAddress ?? null;
    await this.vouchesService.revokeVouch(
      id,
      walletAddress,
      body.signedMessage, // Still passing for compatibility if needed, but service should skip if wallet exists
    );
  }

  // ─── Helius webhook ───────────────────────────────────────────────────────

  /**
   * POST /vouch/webhooks/helius
   *
   * Receives Helius Enhanced Transaction webhook payloads.
   *
   * Design decisions:
   *  - Always returns HTTP 200, a non-200 would cause Helius to retry (up to
   *    3×), risking duplicate-confirm attempts and quota waste.
   *  - Verifies the shared secret header first; on mismatch we still return
   *    200 with { ok: false } to silently drain spoofed requests without
   *    giving the caller any signal about retrying.
   *  - Responds to Helius immediately, then processes via setImmediate so we
   *    stay well inside Helius's 10-second response window.
   *  - @SkipThrottle: Helius can send burst traffic; the global ThrottlerGuard
   *    must not block legitimate webhook deliveries.
   */
  @SkipThrottle()
  @Post('webhooks/helius')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Helius transaction webhook (internal)',
    description:
      'Receives Enhanced Transaction events from Helius for on-chain vouch processing.',
  })
  async heliusWebhook(
    @Headers('x-helius-webhook-secret') secret: string,
    @Body() payload: any[],
    @Res() res: Response,
  ): Promise<void> {
    const expected = this.config.get<string>('HELIUS_WEBHOOK_SECRET');

    // 1. Verify secret, reject spoofed requests
    if (!expected || secret !== expected) {
      this.logger.warn({ reason: 'bad_secret' }, 'helius_webhook_bad_secret');
      // Return 200 anyway, 401 would trigger Helius retries
      res.status(200).json({ ok: false, reason: 'bad_secret' });
      return;
    }

    // 2. Validate payload shape
    if (!Array.isArray(payload) || payload.length === 0) {
      res.status(200).json({ ok: true, processed: 0 });
      return;
    }

    // 3. Respond to Helius immediately, must reply before processing begins
    res.status(200).json({ ok: true, received: payload.length });

    // 4. Process in background after response is flushed
    setImmediate(async () => {
      try {
        await this.heliusWebhookService.processWebhookPayload(
          payload,
          this.vouchesService,
        );
      } catch (err) {
        this.logger.error(
          { err: (err as Error).message },
          'helius_webhook_processing_error',
        );
      }
    });
  }
}
