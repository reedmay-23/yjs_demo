import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { JwtAuthGuard } from '../../utils/jwt.config';
import { RefreshTokenGuard } from '../jwt/refresh-token.guard';
import { RefreshTokenStrategy } from '../jwt/refresh-token.strategy';
import { PrismaService } from '../prisma/prisma.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({}),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    PrismaService,
    RefreshTokenStrategy,
    RefreshTokenGuard,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
  exports: [JwtModule],
})
export class AuthModule {}
