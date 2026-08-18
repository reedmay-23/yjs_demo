import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Req,
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { Request } from 'express';
import { MediaService } from './media.service';
import {
  UploadMediaDto,
  UpdateMediaDto,
  CreateAnnotationDto,
  UpdateAnnotationDto,
  MediaType,
} from './dto/media.dto';

type TokenRequest = Request & {
  user: { sub: number; username: string };
};

@ApiTags('多媒体内容')
@ApiBearerAuth('access-token')
@Controller('media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post('upload')
  @ApiOperation({ summary: '上传媒体文件' })
  upload(@Req() req: TokenRequest, @Body() uploadMediaDto: UploadMediaDto) {
    return this.mediaService.upload(req.user.sub, uploadMediaDto);
  }

  @Get('document/:documentId')
  @ApiOperation({ summary: '获取文档下的所有媒体文件' })
  @ApiQuery({ name: 'fileType', required: false, enum: MediaType })
  findByDocument(
    @Req() req: TokenRequest,
    @Param('documentId', ParseIntPipe) documentId: number,
    @Query('fileType') fileType?: MediaType,
  ) {
    return this.mediaService.findByDocument(req.user.sub, documentId, fileType);
  }

  @Get(':id')
  @ApiOperation({ summary: '获取媒体文件详情' })
  findOne(@Req() req: TokenRequest, @Param('id', ParseIntPipe) id: number) {
    return this.mediaService.findOne(req.user.sub, id);
  }

  @Put(':id')
  @ApiOperation({ summary: '更新媒体文件信息' })
  update(
    @Req() req: TokenRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() updateMediaDto: UpdateMediaDto,
  ) {
    return this.mediaService.update(req.user.sub, id, updateMediaDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除媒体文件' })
  remove(@Req() req: TokenRequest, @Param('id', ParseIntPipe) id: number) {
    return this.mediaService.remove(req.user.sub, id);
  }

  @Post(':id/annotation')
  @ApiOperation({ summary: '创建标注' })
  createAnnotation(
    @Req() req: TokenRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() createAnnotationDto: CreateAnnotationDto,
  ) {
    return this.mediaService.createAnnotation(
      req.user.sub,
      id,
      createAnnotationDto,
    );
  }

  @Get(':id/annotations')
  @ApiOperation({ summary: '获取媒体文件的标注列表' })
  getAnnotations(
    @Req() req: TokenRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.mediaService.getAnnotations(req.user.sub, id);
  }

  @Put('annotation/:annotationId')
  @ApiOperation({ summary: '更新标注' })
  updateAnnotation(
    @Req() req: TokenRequest,
    @Param('annotationId', ParseIntPipe) annotationId: number,
    @Body() updateAnnotationDto: UpdateAnnotationDto,
  ) {
    return this.mediaService.updateAnnotation(
      req.user.sub,
      annotationId,
      updateAnnotationDto,
    );
  }

  @Delete('annotation/:annotationId')
  @ApiOperation({ summary: '删除标注' })
  removeAnnotation(
    @Req() req: TokenRequest,
    @Param('annotationId', ParseIntPipe) annotationId: number,
  ) {
    return this.mediaService.removeAnnotation(req.user.sub, annotationId);
  }
}
