import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { Public } from '../../decorator/public.decorator';
import { RefreshTokenGuard } from '../jwt/refresh-token.guard';
import { CreateAuthDto } from './create-auth.dto';
import { AuthService } from './auth.service';

type RefreshRequest = Request & {
  user: {
    userId: number;
    refreshToken: string;
  };
};

@ApiTags('账户相关')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  @ApiOperation({
    summary: '注册用户',
    description: '用于注册用户',
  })
  authRegister(@Body() body: CreateAuthDto) {
    return this.authService.registered(body);
  }

  @Public()
  @Post('login')
  @ApiOperation({
    summary: '登录',
    description: '用户登录',
  })
  authLogin(@Body() body: CreateAuthDto) {
    return this.authService.login(body);
  }

  @Public()
  @UseGuards(RefreshTokenGuard)
  @Post('refresh')
  @ApiOperation({
    summary: '刷新 token',
    description: '使用 refresh token 刷新 access token 和 refresh token',
  })
  refresh(@Req() req: RefreshRequest) {
    console.log(req, 'kankan 返回怎么过来的');
    return this.authService.refresh(req.user.userId, req.user.refreshToken);
  }
}
