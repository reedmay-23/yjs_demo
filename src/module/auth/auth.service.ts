import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '../../../generated/prisma/client';
import { ResponseCode } from '../../common/constants/response-code.constant';
import { createSuccessResponse } from '../../common/utils/api-response.util';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAuthDto } from './create-auth.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async registered(body: CreateAuthDto) {
    const { account, password } = body;
    this.logger.log('Register user');

    const existed = await this.prisma.user.findFirst({
      where: { account },
      select: { id: true },
    });

    if (existed) {
      throw new ConflictException('用户已存在');
    }

    try {
      const user = await this.prisma.user.create({
        data: {
          account,
          password,
          username: account,
        },
      });

      return createSuccessResponse(user, {
        message: '注册成功',
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('用户已存在');
      }

      throw error;
    }
  }

  async getTokens(userId: number) {
    const payload = { sub: userId };

    const accessToken = await this.jwtService.signAsync(payload, {
      secret: process.env.JWT_ACCESS_SECRET,
      expiresIn: '15m',
    });

    const refreshToken = await this.jwtService.signAsync(payload, {
      secret: process.env.JWT_REFRESH_SECRET,
      expiresIn: '7d',
    });

    return {
      accessToken,
      refreshToken,
    };
  }

  async updateRefreshToken(id: number, refreshToken: string) {
    return this.prisma.user.update({
      where: { id },
      data: { refreshToken },
    });
  }

  async refresh(id: number, refreshToken: string) {
    const userRT = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        refreshToken: true,
      },
    });

    const tokenState = refreshToken === userRT?.refreshToken;
    if (!tokenState) {
      throw new ForbiddenException({
        data: null,
        message: '登录已失效，请重新登录',
        code: ResponseCode.LOGIN_INVALID,
      });
    }

    const tokens = await this.getTokens(id);
    await this.updateRefreshToken(id, tokens.refreshToken);

    return createSuccessResponse(tokens, {
      message: '刷新 token 成功',
    });
  }

  async getMe(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        account: true,
        username: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Current user not found');
    }

    return createSuccessResponse(
      {
        id: user.id,
        account: user.account,
        name: user.username,
        username: user.username,
      },
      {
        message: '获取当前用户成功',
      },
    );
  }

  async login(body: CreateAuthDto) {
    const { account, password } = body;
    this.logger.log('Login user');

    const user = await this.prisma.user.findFirst({
      where: { account },
    });

    if (!user) {
      throw new UnauthorizedException('账号或密码错误');
    }

    const isPasswordValid = password === user.password;
    if (!isPasswordValid) {
      throw new UnauthorizedException('账号或密码错误');
    }

    const tokens = await this.getTokens(user.id);
    await this.updateRefreshToken(user.id, tokens.refreshToken);

    return createSuccessResponse(tokens, {
      message: '登录成功',
    });
  }
}
