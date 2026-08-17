import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { ResponseCode } from '../common/constants/response-code.constant';
import { IS_PUBLIC_KEY } from '../decorator/public.decorator';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: Record<string, unknown> }>();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException({
        data: null,
        message: '未登录',
        code: ResponseCode.ACCESS_TOKEN_INVALID,
      });
    }

    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: process.env.JWT_ACCESS_SECRET,
      });
      request.user = payload as Record<string, unknown>;
    } catch {
      throw new UnauthorizedException({
        data: null,
        message: '登录已过期或 token 无效',
        code: ResponseCode.ACCESS_TOKEN_INVALID,
      });
    }

    return true;
  }

  private extractTokenFromHeader(request: Request) {
    const authorization = request.headers.authorization;
    if (!authorization) return undefined;
    const [type, token] = authorization.split(' ');
    return type === 'Bearer' ? token : undefined;
  }
}
