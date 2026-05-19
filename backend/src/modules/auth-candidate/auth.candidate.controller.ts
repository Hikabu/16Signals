import {
  Controller,
  Get,
  Post,
  Req,
  Res,
  Body,
  UseGuards,
  Query,
} from '@nestjs/common';
import { CookieOptions, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { AuthCandidateService } from './auth.candidate.service';
import { AuthGuard } from '@nestjs/passport';
import { LoginDtoSchema } from './schemas/login.schema';
import { RegisterDto } from './schemas/register.schema';
import { OnboardingDto } from './schemas/onboarding.schema';
import {
  ActivateMfaDto,
  VerifyMfaDto,
  VerifyMfaRecoveryDto,
} from './schemas/mfa.schema';
import {
  RequestPasswordResetDto,
  ResetPasswordDto,
} from './schemas/password-reset.schema';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { GithubLinkGuard } from './guards/github.link.guard';
import { GoogleLinkGuard } from './guards/google.link.guard';
import { VerifiedAuth } from '../../shared/decorators/verified.decorator';
import {
  VerifyEmailDto,
  OAuthCallbackQueryDto,
} from './schemas/auth-contract.dto';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiBody,
  ApiQuery,
  ApiOkResponse,
} from '@nestjs/swagger';
import { OnboardingGuard } from './guards/onboarding.guard';
import { AuthState } from './schemas/auth-result.dto';

@ApiTags('Auth (candidates)')
@Throttle({ default: { limit: 500, ttl: 60000 } })
@Controller('auth/candidate')
export class AuthCandidateController {
  constructor(
    private readonly authService: AuthCandidateService,
    private readonly config: ConfigService,
  ) {}

  private readonly authCookieOptions: CookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  };

  private getFrontendUrl() {
    return this.config.get<string>('FRONTEND_URL') || '';
  }

  private handleAuthResponse(
    req: any,
    res: Response,
    result: any,
    successRedirect?: string,
  ) {
    const wantsJson = req?.accepts?.(['html', 'json']) === 'json';

    switch (result.type) {
      case AuthState.SUCCESS: {
        res.cookie(
          'access_token',
          result.data.accessToken,
          this.authCookieOptions,
        );
        res.cookie(
          'refresh_token',
          result.data.refreshToken,
          this.authCookieOptions,
        );
        if (successRedirect && !wantsJson) {
          return res.redirect(successRedirect);
        }

        return res.status(200).json({
          success: true,
          data: {
            accessToken: result.data.accessToken,
            role: 'candidate',
          },
        });
      }

      case AuthState.NEEDS_VERIFICATION:
        if (wantsJson) {
          return res.status(403).json({
            code: 'email_verification_required',
            email: result.data.email,
            message: 'Email verification required.',
          });
        }

        return res.redirect(
          `${this.getFrontendUrl()}/auth?verify_email=${encodeURIComponent(result.data.email)}`,
        );

      case AuthState.MFA_REQUIRED: {
        if (wantsJson) {
          return res.status(401).json({
            code: 'mfa_required',
            mfaToken: result.data.mfaToken,
            userId: result.data.userId,
            message: 'MFA verification required.',
          });
        }

        const params = new URLSearchParams({
          mfa_token: result.data.mfaToken,
        });
        if (result.data.userId) {
          params.set('user_id', result.data.userId);
        }
        return res.redirect(
          `${this.getFrontendUrl()}/auth?${params.toString()}`,
        );
      }

      case AuthState.NEEDS_ONBOARDING:
        res.cookie('temp_auth', result.data.tempToken, this.authCookieOptions);
        if (wantsJson) {
          return res.status(202).json({
            code: 'onboarding_required',
            token: result.data.tempToken,
            message: 'Onboarding required.',
          });
        }

        return res.redirect(`${this.getFrontendUrl()}/auth?onboarding=1`);

      default:
        return res.status(401).json({ message: 'Invalid auth state' });
    }
  }

  // ---------------- REGISTER ----------------

  @Post('register')
  @ApiOperation({
    summary: 'Create new user account',
    description:
      'Registers a new user and starts email verification flow. May return auth state depending on verification status.',
  })
  @ApiBody({ type: RegisterDto })
  async register(@Body() dto: any, @Res() res: Response) {
    const result = await this.authService.register(dto);
    return res.status(202).json(result);
  }

  // ---------------- EMAIL VERIFICATION ----------------

  @Post('verify-email')
  @ApiOperation({
    summary: 'Verify email address',
    description:
      'Validates email verification code and activates user account.',
  })
  @ApiBody({ type: VerifyEmailDto })
  @ApiOkResponse({
    description: 'Email verified successfully',
    schema: {
      example: { success: true },
    },
  })
  async verifyEmail(@Body() dto: any) {
    await this.authService.verifyEmail(dto.code);
    return { success: true };
  }

  // ---------------- LOGIN ----------------

  @Post('login')
  @ApiOperation({
    summary: 'Authenticate user',
    description:
      'Validates credentials and returns auth state (tokens, MFA, onboarding, or verification).',
  })
  @ApiBody({ type: LoginDtoSchema })
  async login(
    @Body() dto: any,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const result = await this.authService.login(dto);
    return this.handleAuthResponse(req, res, result);
  }

  // ---------------- LOGOUT ----------------

  @VerifiedAuth()
  @Post('logout')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Logout user',
    description: 'Invalidates refresh token and clears session cookies.',
  })
  async logout(@Req() req: any, @Res() res: Response) {
    await this.authService.logout(req.user);

    res.clearCookie('access_token');
    res.clearCookie('refresh_token');

    return res.json({ success: true });
  }

  // ---------------- OAUTH ----------------

  @UseGuards(AuthGuard('github'))
  @Get('github')
  @ApiOperation({
    summary: 'Start GitHub OAuth login',
    description: 'Redirects user to GitHub authentication page.',
  })
  githubLogin() {}

  @UseGuards(AuthGuard('github'))
  @Get('github/callback')
  @SkipThrottle()
  @ApiOperation({
    summary: 'GitHub OAuth callback',
    description:
      'Handles GitHub login callback and returns auth state response.',
  })
  async githubCallback(@Req() req: any, @Res() res: Response) {
    const result = await this.authService.oauthLogin(req.user, 'GITHUB');
    return this.handleAuthResponse(
      req,
      res,
      result,
      `${this.getFrontendUrl()}/profile`,
    );
  }

  @UseGuards(AuthGuard('google'))
  @Get('google')
  @ApiOperation({
    summary: 'Start Google OAuth login',
  })
  googleLogin() {}

  @UseGuards(AuthGuard('google'))
  @Get('google/callback')
  @SkipThrottle()
  async googleCallback(@Req() req: any, @Res() res: Response) {
    const result = await this.authService.oauthLogin(req.user, 'GOOGLE');
    return this.handleAuthResponse(
      req,
      res,
      result,
      `${this.getFrontendUrl()}/profile`,
    );
  }

  // ---------------- ONBOARDING ----------------

  @UseGuards(OnboardingGuard)
  @Post('onboarding')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Complete onboarding',
    description: 'Finalizes onboarding using temporary auth token.',
  })
  @ApiBody({ type: OnboardingDto })
  async completeOnboarding(
    @Body() dto: any,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const result = await this.authService.completeOnboarding(
      dto,
      req.onboarding,
    );
    return this.handleAuthResponse(req, res, result);
  }

  // ---------------- ACCOUNT LINKING ----------------

  @Get('github/link')
  @VerifiedAuth()
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Link GitHub account',
  })
  async linkGithub(@Req() req, @Res() res) {
    const url = await this.authService.githubLink(req.user.id);
    return res.redirect(url);
  }

  @UseGuards(AuthGuard('jwt'), GithubLinkGuard)
  @Get('github/link/callback')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'GitHub linking callback',
  })
  @ApiQuery({
    name: 'state',
    required: true,
  })
  async linkGithubCallback(
    @Req() req: any,
    @Res() res: Response,
    @Query() query: OAuthCallbackQueryDto,
  ) {
    await this.authService.linkOAuth(
      req.authUser.id,
      req.user,
      'GITHUB',
      query.state,
    );
    return res.redirect(`${this.getFrontendUrl()}/profile?linked=github`);
  }

  // ---------------- GOOGLE LINK ----------------

  @VerifiedAuth()
  @Get('google/link')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Link Google account',
  })
  async linkGoogle(@Req() req, @Res() res) {
    const url = await this.authService.googleLink(req.user.id);
    return res.redirect(url);
  }

  @UseGuards(AuthGuard('jwt'), GoogleLinkGuard)
  @Get('google/link/callback')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Google linking callback',
  })
  @ApiQuery({
    name: 'state',
    required: true,
  })
  async linkGoogleCallback(
    @Req() req: any,
    @Res() res: Response,
    @Query() query: OAuthCallbackQueryDto,
  ) {
    await this.authService.linkOAuth(
      req.authUser.id,
      req.user,
      'GOOGLE',
      query.state,
    );
    return res.redirect(`${this.getFrontendUrl()}/profile?linked=google`);
  }

  // ---------------- REFRESH ----------------

  @UseGuards(AuthGuard('refresh'))
  @Post('refresh')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Refresh tokens',
  })
  async refresh(@Req() req: any, @Res() res: Response) {
    const result = await this.authService.refresh(req.user);
    return this.handleAuthResponse(req, res, result);
  }

  // ---------------- PASSWORD RESET ----------------

  @Post('password-reset/request')
  @ApiOperation({
    summary: 'Request password reset',
    description:
      'Starts the password reset flow. Always returns a generic success response.',
  })
  @ApiBody({ type: RequestPasswordResetDto })
  async requestPasswordReset(@Body() dto: any) {
    await this.authService.requestPasswordReset(dto);
    return {
      success: true,
      message:
        'If an account exists with this email, you will receive a reset link.',
    };
  }

  @Post('password-reset/confirm')
  @ApiOperation({
    summary: 'Confirm password reset',
    description: 'Resets the password with a valid password reset token.',
  })
  @ApiBody({ type: ResetPasswordDto })
  async resetPassword(@Body() dto: any) {
    await this.authService.resetPassword(dto);
    return { success: true };
  }

  // ---------------- MFA ----------------

  @VerifiedAuth()
  @Get('mfa/setup')
  @ApiBearerAuth()
  setupMfa(@Req() req: any) {
    return this.authService.setupMfa(req.user.id);
  }

  @VerifiedAuth()
  @Post('mfa/activate')
  @ApiBearerAuth()
  @ApiBody({ type: ActivateMfaDto })
  activateMfa(@Req() req: any, @Body() dto: any) {
    return this.authService.activateMfa(req.user.id, dto.code);
  }

  @Post('mfa/verify')
  @ApiBody({ type: VerifyMfaDto })
  async verifyMfa(
    @Body() dto: any,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const result = await this.authService.verifyMfa(
      dto.userId,
      dto.code,
      dto.mfaToken,
    );
    return this.handleAuthResponse(req, res, result);
  }

  @Post('mfa/verify-recovery')
  @ApiBody({ type: VerifyMfaRecoveryDto })
  async verifyMfaRecovery(
    @Body() dto: any,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const result = await this.authService.verifyMfaRecovery(
      dto.userId,
      dto.backupCode,
      dto.mfaToken,
    );
    return this.handleAuthResponse(req, res, result);
  }

  // ---------------- SECURITY INFO ----------------

  @VerifiedAuth()
  @Get('me/security')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get security settings',
    description: 'Returns mfaEnabled status, hasPassword, and linkedProviders for the authenticated user.',
  })
  @ApiOkResponse({
    description: 'Security info',
    schema: {
      example: {
        mfaEnabled: false,
        hasPassword: true,
        linkedProviders: ['LOCAL', 'GITHUB'],
      },
    },
  })
  getSecurityInfo(@Req() req: any) {
    return this.authService.getSecurityInfo(req.user.id);
  }

  // ---------------- CHANGE / SET PASSWORD ----------------

  @VerifiedAuth()
  @Post('me/change-password')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Change or set password',
    description: 'If the user already has a local password, currentPassword is required. If not (OAuth-only user), sets a password without requiring currentPassword.',
  })
  @ApiBody({
    schema: {
      example: {
        currentPassword: 'old-pass (only if hasPassword is true)',
        newPassword: 'new-pass',
      },
    },
  })
  async changePassword(@Req() req: any, @Body() dto: any) {
    await this.authService.changePassword(req.user.id, dto);
    return { success: true };
  }
}

