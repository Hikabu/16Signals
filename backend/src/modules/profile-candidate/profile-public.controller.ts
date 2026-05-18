import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiBadRequestResponse,
} from '@nestjs/swagger';

import { ProfileService } from './profile.service';
import { RegisterWaitlistDto } from './dto/register-waitlist.dto';

@ApiTags('Public Profiles')
@Controller('profile')
export class PublicProfileController {
  constructor(
    private readonly profileService: ProfileService,
  ) {}

  @Get('public/:username')
  getPublicProfile(
    @Param('username') username: string,
  ) {
    return this.profileService.getPublicProfile(
      username,
    );
  }

  @Get('public')
  searchPublicProfiles(@Query('q') q?: string) {
    return this.profileService.searchPublicProfiles(q || '');
  }

  // ─── Employer Launch Waitlist (public, no auth) ──────────────────────────

  @Post('waitlist')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Join employer launch waitlist (guest)',
    description:
      'Stores the email and sends a confirmation email. Idempotent, calling twice with the same email is a no-op.',
  })
  @ApiOkResponse({ description: 'Joined the waitlist' })
  @ApiBadRequestResponse({ description: 'Invalid email address' })
  registerWaitlist(@Body() dto: RegisterWaitlistDto) {
    return this.profileService.registerWaitlistGuest(dto.email);
  }
}