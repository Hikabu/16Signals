import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { CompaniesService } from './companies.service';
import { CompaniesController } from './companies.controller';
import { EmployerWaitlistController } from './employer-waitlist.controller';
import { JwtAuthGuard } from '../auth-employer/guards/jwt-auth.guard';

@Module({
  imports: [BullModule.registerQueue({ name: 'email' })],
  controllers: [CompaniesController, EmployerWaitlistController],
  providers: [CompaniesService, JwtAuthGuard],
  exports: [CompaniesService],
})
export class CompaniesModule {}
