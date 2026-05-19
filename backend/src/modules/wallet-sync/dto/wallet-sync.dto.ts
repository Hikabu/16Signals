import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

/**
 * Response: challenge generation
 */
export class ChallengeResponseDto {
  @ApiProperty({
    description:
      'Cryptographic challenge string used to verify wallet ownership',
    example: 'link-wallet:user123:1713940000000:a1b2c3',
  })
  challenge: string;
}

/**
 * Request: link wallet
 */
export class LinkWalletRequestDto {
  @ApiProperty({
    description: 'Solana wallet public address (Base58 encoded)',
    example: '7Gg3xYzExampleSolanaWalletAddress123',
  })
  @IsString()
  @Matches(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, {
    message: 'Invalid Solana wallet address format',
  })
  walletAddress: string;

  @ApiProperty({
    description:
      'Base58 encoded signature of the challenge signed by the wallet private key',
    example: '5hK9xExampleSignatureBase58EncodedString',
  })
  @IsString()
  signature: string;

  @ApiProperty({
    description: 'The plaintext message that was signed',
    example: 'Link Solana wallet to 16Signals\nUser: user123\nTimestamp: 1713940000000',
    required: false,
  })
  @IsString()
  message?: string;
}

/**
 * Response: wallet linking result
 */
export class LinkWalletResponseDto {
  @ApiProperty({
    description: 'Indicates whether wallet was successfully linked',
    example: true,
  })
  linked: boolean;

  @ApiProperty({
    description: 'Linked Solana wallet address',
    example: '7Gg3xYzExampleSolanaWalletAddress123',
  })
  solanaAddress: string;
}

/**
 * Standard error response for Swagger consistency
 */
export class WalletSyncErrorResponseDto {
  @ApiProperty({ example: 400 })
  statusCode: number;

  @ApiProperty({ example: 'Validation failed' })
  message: string | string[];

  @ApiProperty({ example: 'Bad Request' })
  error: string;
}
