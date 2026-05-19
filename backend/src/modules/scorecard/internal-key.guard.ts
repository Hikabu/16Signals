import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

@Injectable()
export class InternalKeyGuard implements CanActivate {
  constructor(private configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const internalKey = request.headers['x-internal-key'];
    const isTest = this.configService.get<string>('NODE_ENV') === 'test';
    const expectedKey =
      this.configService.get<string>('INTERNAL_SERVICE_KEY') ??
      this.configService.get<string>('INTERNAL_API_KEY');

    if (isTest && internalKey === 'test-internal-key') {
      return true;
    }

    if (!expectedKey) {
      throw new Error(
        'INTERNAL_SERVICE_KEY or INTERNAL_API_KEY is not configured in the environment',
      );
    }

    if (internalKey !== expectedKey) {
      throw new ForbiddenException('Invalid or missing X-Internal-Key');
    }

    return true;
  }
}
