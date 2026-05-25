import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module';
import { BriefCacheService } from './brief-cache.service';

@Module({
  imports: [PrismaModule],
  providers: [BriefCacheService],
  exports: [BriefCacheService],
})
export class BriefCacheModule {}
