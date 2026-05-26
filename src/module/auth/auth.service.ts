import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAuthDto } from './create-auth.dto';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';

@Injectable()
export class AuthService {
  private logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  // 注册
  async registered(body: CreateAuthDto) {
    const { account, password } = body;
    this.logger.log('进行用户注册功能');
    const existed = await this.prisma.user.findFirst({
      where: {
        account,
      },
      select: { id: true, username: true },
    });
    if (existed) {
      throw new ConflictException('用户已存在');
    }
    try {
      const user = this.prisma.user.create({
        data: {
          account,
          password,
          username: account,
        },
      });
      return user;
    } catch (error) {
      // 并发场景下，先查也不够，最终还是靠唯一约束
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('用户已存在');
      }
      throw error;
    }
  }

  // 登录
  async login(body: CreateAuthDto) {
    const { account, password } = body;

    this.logger.log('进行用户登录功能');
    const user = await this.prisma.user.findFirst({
      where: {
        account,
      },
    });

    // if(!user) return throw new UnauthorizedException('用户不存在')

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('账号或密码错误');
    }

    const payload = {
      sub: user.id,
      username: user.username,
    };

    const token = await this.jwtService.signAsync(payload);
    return this.prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        token,
      },
    });
  }
}
