import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';

type RefreshTokenPayload = {
  sub: number;
};

@Injectable()
export class RefreshTokenStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_REFRESH_SECRET,
      passReqToCallback: true,
    });
  }

  validate(req: Request, payload: RefreshTokenPayload) {
    const refreshToken = ExtractJwt.fromAuthHeaderAsBearerToken()(req);

    console.log(refreshToken, payload, '刷新校验');

    return {
      userId: payload.sub,
      refreshToken,
    };
  }
}
