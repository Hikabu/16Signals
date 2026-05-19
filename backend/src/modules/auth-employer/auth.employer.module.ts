import { Module } from '@nestjs/common';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { AuthEmployerService } from './auth.employer.service';
import { AuthEmployerController } from './auth.employer.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { EmployerRefreshStrategy } from './strategies/refresh.strategy';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService): JwtModuleOptions => ({
        secret: config.get<string>('JWT_ACCESS_SECRET'),
        signOptions: { expiresIn: '15m' },
      }),
    }),
  ],
  controllers: [AuthEmployerController],
  providers: [AuthEmployerService, JwtStrategy, EmployerRefreshStrategy],
  exports: [AuthEmployerService],
})
export class AuthEmployerModule {}
