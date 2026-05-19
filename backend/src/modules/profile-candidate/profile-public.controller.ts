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
  ApiConflictResponse,
} from '@nestjs/swagger';

import { ProfileService } from './profile.service';
import { RegisterWaitlistDto } from './dto/register-waitlist.dto';
import { RegisterNonDevWaitlistDto } from './dto/register-nondev-waitlist.dto';

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
    return this.profileService.getPublicProfile(username);
  }

  @Get('public')
  searchPublicProfiles(@Query('q') q?: string) {
    return this.profileService.searchPublicProfiles(q || '');
  }

  // ─── Legacy employer launch waitlist (guest) ─────────────────────────────

  @Post('waitlist')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Join employer launch waitlist (guest)' })
  @ApiOkResponse({ description: 'Joined the waitlist' })
  @ApiBadRequestResponse({ description: 'Invalid email address' })
  registerWaitlist(@Body() dto: RegisterWaitlistDto) {
    return this.profileService.registerWaitlistGuest(dto.email);
  }

  // ─── Non-developer candidate waitlist ────────────────────────────────────

  @Get('candidate-waitlist/status')
  @ApiOperation({ summary: 'Check if email is already on the non-dev candidate waitlist' })
  @ApiOkResponse({ description: '{ registered: boolean }' })
  getNonDevWaitlistStatus(@Query('email') email: string) {
    return this.profileService.getNonDevWaitlistStatus(email);
  }

  @Post('candidate-waitlist')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Join the non-developer candidate waitlist' })
  @ApiOkResponse({ description: 'Successfully joined the waitlist' })
  @ApiConflictResponse({ description: 'Email already on the waitlist' })
  @ApiBadRequestResponse({ description: 'Invalid payload' })
  registerNonDevWaitlist(@Body() dto: RegisterNonDevWaitlistDto) {
    return this.profileService.registerNonDevWaitlist(dto);
  }
}