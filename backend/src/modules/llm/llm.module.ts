import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LlmClientService } from './llm-client.service';

@Module({
  imports: [ConfigModule],
  providers: [LlmClientService],
  exports: [LlmClientService],
})
export class LlmModule {}
