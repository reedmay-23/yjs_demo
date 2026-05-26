import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreateAuthDto } from './create-auth.dto';
import { AuthService } from './auth.service';
import { Public } from '../../decorator/public.decorator';

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
    // const { account, password } = body;
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
}
