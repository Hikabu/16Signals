import { Controller, Post, UseGuards, Res, Req, Logger } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiOkResponse,
  ApiUnauthorizedResponse,
  ApiBadRequestResponse,
} from '@nestjs/swagger';
import { CookieOptions, Request, Response } from 'express';

import { AuthEmployerService } from './auth.employer.service';
import { BaseController } from '../../shared/base.controller';
import { Public } from './decorators/public.decorator';
import { AuthGuard } from '@nestjs/passport/dist/auth.guard';
import { verifyPrivyToken } from './verify-privy-token';

class LoginResponseDto {
  token: string;
  accessToken: string;
  role: 'employer';
  username: string;
  user: {
    id: string;
    name: string;
    email: string | null;
    walletAddress: string | null;
    privyUserId: string;
  };
}

class AuthEmplErrorResponseDto {
  statusCode: number;
  message: string;
  error: string;
}

@ApiTags('Auth (Employer)')
@Controller('auth/employer')
export class AuthEmployerController extends BaseController {
  private readonly logger = new Logger(AuthEmployerController.name);

  constructor(private readonly authService: AuthEmployerService) {
    super();
  }

  private readonly authCookieOptions: CookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  };

  private setAuthCookies(
    res: Response,
    result: { accessToken: string; refreshToken: string },
  ) {
    res.cookie('access_token', result.accessToken, this.authCookieOptions);
    res.cookie('refresh_token', result.refreshToken, this.authCookieOptions);
  }

  // ---------------- LOGIN ----------------

  @Public()
  @Post('login')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Login with Privy token',
    description:
      'Verifies a Privy access token from Authorization header and returns an employer JWT.',
  })
  @ApiOkResponse({
    description: 'Successfully authenticated and returned application JWT',
    type: LoginResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid or missing Privy token',
    type: AuthEmplErrorResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Missing authorization header or invalid request payload',
    type: AuthEmplErrorResponseDto,
  })
  async login(@Req() req: Request, @Res() res: Response) {
    try {
      const privyUser = await verifyPrivyToken(req);
      this.logger.log(`Privy user verified: ${privyUser.privyUserId}`);
      const result = await this.authService.login(privyUser);
      this.setAuthCookies(res, result);
      return res.json({
        success: true,
        message: 'Logged in successfully',
        data: result,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Employer Privy login failed: ${errorMessage}`);
      throw error;
    }
  }

  @Post('logout')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt-employer'))
  @ApiOperation({
    summary: 'Logout user',
    description: 'Invalidates the refresh token and clears session cookies.',
  })
  async logout(@Req() req: any, @Res() res: Response) {
    await this.authService.logout(req.user.id);

    res.clearCookie('access_token');
    res.clearCookie('refresh_token');
    return res.json({
      success: true,
      message: 'Logged out successfully',
      data: null,
    });
  }

  @Post('refresh')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('refresh-employer'))
  @ApiOperation({
    summary: 'Refresh employer tokens',
    description:
      'Rotates the employer refresh token and issues a new access token.',
  })
  async refresh(@Req() req: any, @Res() res: Response) {
    const result = await this.authService.refresh(req.user);
    this.setAuthCookies(res, result);
    return res.json({
      success: true,
      message: 'Token refreshed successfully',
      data: result,
    });
  }
}
