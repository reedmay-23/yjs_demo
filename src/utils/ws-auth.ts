import { JwtService } from '@nestjs/jwt';
import * as http from 'node:http';
import { urlParamsHandle } from './urlParams';

export type WsAccessPayload = {
  sub: number;
};

export function getWsAccessToken(req: http.IncomingMessage): string | null {
  const params = urlParamsHandle(req);
  const queryToken = params.get('accessToken') ?? params.get('token');

  if (queryToken) {
    return queryToken;
  }

  const authorization = req.headers.authorization;
  const header = Array.isArray(authorization) ? authorization[0] : authorization;

  if (!header) {
    return null;
  }

  const [type, token] = header.split(' ');
  return type === 'Bearer' && token ? token : null;
}

export async function verifyWsAccessToken(
  jwtService: JwtService,
  req: http.IncomingMessage,
): Promise<WsAccessPayload> {
  const token = getWsAccessToken(req);

  if (!token) {
    throw new Error('missing_access_token');
  }

  const payload = await jwtService.verifyAsync<WsAccessPayload>(token, {
    secret: process.env.JWT_ACCESS_SECRET,
  });

  if (!Number.isSafeInteger(payload.sub)) {
    throw new Error('invalid_access_token_payload');
  }

  return payload;
}
