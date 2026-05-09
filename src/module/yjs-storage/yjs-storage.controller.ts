import { Body, Controller, Post } from '@nestjs/common';
import { YjsStorageService } from './yjs-storage.service';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('yjs文档相关')
@Controller('yjs-storage')
export class YjsStorageController {
  constructor(private readonly yjsService: YjsStorageService) {}

  @Post('/create')
  @ApiOperation({ summary: '创建文档实例' })
  createDoc(@Body() doc: any) {
    return this.yjsService.createDocument(doc ?? {});
  }
}
