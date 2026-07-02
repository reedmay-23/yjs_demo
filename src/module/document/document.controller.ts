import { Body, Controller, Delete, Get, Param, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam } from '@nestjs/swagger';
import { Request } from 'express';
import { DocumentService } from './document.service';
import {
  AddCollaboratorDto,
  GetCollaboratorsDto,
  RemoveCollaboratorDto,
} from './dto/add-collaborator.dto';
import { CreateDocumentDto } from './dto/create-document.dto';

type TokenRequest = Request & {
  user: {
    sub: number;
  };
};

@ApiBearerAuth('access-token')
@Controller('document')
export class DocumentController {
  constructor(private readonly documentService: DocumentService) {}

  @Post('/create')
  @ApiOperation({
    summary: '创建文档',
  })
  create(@Req() req: TokenRequest, @Body() createDocumentDto: CreateDocumentDto) {
    return this.documentService.create(req.user.sub, createDocumentDto);
  }

  @Get('/getList')
  @ApiOperation({
    summary: '获取文档列表',
  })
  findAll(@Req() req: TokenRequest) {
    return this.documentService.getList(req.user.sub);
  }

  @Delete('/delete/:id')
  @ApiOperation({
    summary: '删除文档',
  })
  @ApiParam({ name: 'id', type: Number, description: '文档ID', example: 1 })
  remove(@Req() req: TokenRequest, @Param('id') id: string) {
    return this.documentService.remove(req.user.sub, id);
  }

  @Post('/collaborators/add')
  @ApiOperation({
    summary: '添加文档协作者',
  })
  addCollaborator(
    @Req() req: TokenRequest,
    @Body() addCollaboratorDto: AddCollaboratorDto,
  ) {
    return this.documentService.addCollaborator(
      req.user.sub,
      addCollaboratorDto.documentId,
      addCollaboratorDto,
    );
  }

  @Post('/collaborators/list')
  @ApiOperation({
    summary: '获取文档协作者列表',
  })
  getCollaborators(
    @Req() req: TokenRequest,
    @Body() getCollaboratorsDto: GetCollaboratorsDto,
  ) {
    return this.documentService.getCollaborators(
      req.user.sub,
      getCollaboratorsDto.documentId,
    );
  }

  @Post('/collaborators/remove')
  @ApiOperation({
    summary: '移除文档协作者',
  })
  removeCollaborator(
    @Req() req: TokenRequest,
    @Body() removeCollaboratorDto: RemoveCollaboratorDto,
  ) {
    return this.documentService.removeCollaborator(
      req.user.sub,
      removeCollaboratorDto.documentId,
      removeCollaboratorDto.userId,
    );
  }
}
