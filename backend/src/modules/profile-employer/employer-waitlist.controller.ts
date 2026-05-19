import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CompaniesService } from './companies.service';
import { RegisterEmployerWaitlistDto } from './dto/register-employer-waitlist.dto';

@ApiTags('Employer Waitlist (public)')
@Controller('employer/waitlist')
export class EmployerWaitlistController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Get('status')
  @ApiOperation({
    summary: 'Check employer waitlist registration status',
    description: 'Returns whether the given email is already registered on the employer waitlist.',
  })
  @ApiOkResponse({ description: '{ registered: boolean }' })
  getStatus(@Query('email') email: string) {
    return this.companiesService.getEmployerWaitlistStatus(email);
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Join employer waitlist',
    description:
      'Registers a company on the employer waitlist. Returns 409 if already registered.',
  })
  @ApiOkResponse({ description: '{ message: string }' })
  @ApiConflictResponse({ description: 'Email already registered' })
  register(@Body() dto: RegisterEmployerWaitlistDto) {
    return this.companiesService.registerEmployerWaitlist(dto);
  }
}
