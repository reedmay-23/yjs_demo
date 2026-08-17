import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { UserService } from './user.service';

@ApiTags('用户')
@ApiBearerAuth('access-token')
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('/search')
  @ApiOperation({
    summary: '搜索用户',
  })
  @ApiQuery({
    name: 'keyword',
    required: true,
    description: '账号或用户名关键字',
    example: 'system',
  })
  @ApiOkResponse({
    description: '返回匹配的用户基础信息',
    schema: {
      example: {
        code: 0,
        message: '搜索用户成功',
        data: [
          {
            id: 1,
            account: 'system',
            name: 'system',
            username: 'system',
          },
        ],
      },
    },
  })
  search(@Query('keyword') keyword?: string) {
    return this.userService.search(keyword);
  }
}
