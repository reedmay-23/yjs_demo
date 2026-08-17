import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { createSuccessResponse } from '../../common/utils/api-response.util';
import { YjsStorageService } from './yjs-storage.service';

type TokenRequest = Request & {
  user: {
    sub: number;
  };
};

@ApiTags('yjs文档相关')
@ApiBearerAuth('access-token')
@Controller('yjs-storage')
export class YjsStorageController {
  constructor(private readonly yjsService: YjsStorageService) {}

  @Post('/create')
  @ApiOperation({ summary: '创建文档实例' })
  createDoc(@Req() req: TokenRequest, @Body() doc: any) {
    return this.yjsService.createDocument({
      ...(doc ?? {}),
      createdBy: req.user.sub,
    });
  }

  @Get('/sessions/:docId')
  @ApiOperation({ summary: '查询文档在线协同用户' })
  @ApiParam({ name: 'docId', type: Number, description: '文档ID', example: 1 })
  async getActiveSessions(@Req() req: TokenRequest, @Param('docId') docId: string) {
    const res = await this.yjsService.getActiveSessions(docId, req.user.sub);

    return createSuccessResponse(res, {
      message: '获取在线协同用户成功',
    });
  }
}
