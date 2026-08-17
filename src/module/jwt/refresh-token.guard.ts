import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ResponseCode } from '../../common/constants/response-code.constant';

@Injectable()
export class RefreshTokenGuard extends AuthGuard('jwt-refresh') {
  handleRequest<TUser = unknown>(
    err: unknown,
    user: TUser,
    _info: unknown,
    _context: ExecutionContext,
    _status?: unknown,
  ): TUser {
    if (err || !user) {
      throw (
        err ??
        new UnauthorizedException({
          data: null,
          message: '登录已失效，请重新登录',
          code: ResponseCode.LOGIN_INVALID,
        })
      );
    }

    return user;
  }
}
