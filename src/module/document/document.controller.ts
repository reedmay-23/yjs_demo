import { Body, Controller, Delete, Get, Param, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiParam } from '@nestjs/swagger';
import { Request } from 'express';
import { DocumentService } from './document.service';
import {
  AddCollaboratorDto,
  GetCollaboratorsDto,
  RemoveCollaboratorDto,
  UpdateCollaboratorRoleDto,
} from './dto/add-collaborator.dto';
import { CreateDocumentDto } from './dto/create-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';

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
  @ApiOkResponse({
    description: '创建文档成功',
    schema: {
      example: {
        code: 0,
        message: '文档创建成功',
        data: {
          id: 1,
          title: '项目方案',
          summary: '摘要',
          status: 'active',
          createdBy: 1,
          updatedAt: '2026-07-02T00:00:00.000Z',
        },
      },
    },
  })
  create(@Req() req: TokenRequest, @Body() createDocumentDto: CreateDocumentDto) {
    return this.documentService.create(req.user.sub, createDocumentDto);
  }

  @Get('/getList')
  @ApiOperation({
    summary: '获取文档列表',
  })
  @ApiOkResponse({
    description: '返回当前用户可访问的文档列表，每项明确包含 role',
    schema: {
      example: {
        code: 0,
        message: '获取文档列表成功',
        data: [
          {
            id: 1,
            title: '项目方案',
            summary: '摘要',
            status: 'active',
            owner: { id: 1, account: 'system', username: 'system' },
            role: 'editor',
            updatedAt: '2026-07-02T00:00:00.000Z',
          },
        ],
      },
    },
  })
  findAll(@Req() req: TokenRequest) {
    return this.documentService.getList(req.user.sub);
  }

  @Get('/detail/:id')
  @ApiOperation({
    summary: '获取单文档详情',
  })
  @ApiParam({ name: 'id', type: Number, description: '文档 ID', example: 1 })
  @ApiOkResponse({
    description: '返回文档详情、当前用户角色和协作者列表',
    schema: {
      example: {
        code: 0,
        message: '获取文档详情成功',
        data: {
          id: 1,
          title: '项目方案',
          summary: '摘要',
          owner: { id: 1, account: 'system', username: 'system' },
          role: 'viewer',
          status: 'active',
          updatedAt: '2026-07-02T00:00:00.000Z',
          collaborators: [
            {
              userId: 1,
              role: 'owner',
              user: { id: 1, account: 'system', username: 'system' },
            },
          ],
        },
      },
    },
  })
  detail(@Req() req: TokenRequest, @Param('id') id: string) {
    return this.documentService.getDetail(req.user.sub, id);
  }

  @Get('/read/:id')
  @ApiOperation({
    summary: '只读读取文档内容',
  })
  @ApiParam({ name: 'id', type: Number, description: '文档 ID', example: 1 })
  @ApiOkResponse({
    description: '返回 viewer/editor/owner 可读的文本内容',
    schema: {
      example: {
        code: 0,
        message: '读取文档内容成功',
        data: {
          id: 1,
          title: '项目方案',
          role: 'viewer',
          content: {
            type: 'text',
            text: '文档正文',
          },
        },
      },
    },
  })
  read(@Req() req: TokenRequest, @Param('id') id: string) {
    return this.documentService.readContent(req.user.sub, id);
  }

  @Post('/update')
  @ApiOperation({
    summary: '更新文档标题、摘要、状态',
  })
  @ApiOkResponse({
    description: '返回更新后的文档元数据',
    schema: {
      example: {
        code: 0,
        message: '更新文档元数据成功',
        data: {
          id: 1,
          title: '项目方案 v2',
          summary: '更新后的摘要',
          status: 'active',
          updatedAt: '2026-07-02T00:00:00.000Z',
        },
      },
    },
  })
  update(@Req() req: TokenRequest, @Body() updateDocumentDto: UpdateDocumentDto) {
    return this.documentService.updateMetadata(req.user.sub, updateDocumentDto);
  }

  @Get('/statistics')
  @ApiOperation({
    summary: '获取文档统计',
  })
  @ApiOkResponse({
    description: '返回当前用户可访问文档的统计信息',
    schema: {
      example: {
        code: 0,
        message: '获取文档统计成功',
        data: {
          totalDocuments: 12,
          todayUpdatedDocuments: 3,
          onlineCollaborators: 5,
        },
      },
    },
  })
  statistics(@Req() req: TokenRequest) {
    return this.documentService.getStatistics(req.user.sub);
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
  @ApiOkResponse({
    description: '返回 owner/editor/viewer 协作者列表和用户基础信息',
    schema: {
      example: {
        code: 0,
        message: '获取协作者列表成功',
        data: [
          {
            userId: 1,
            role: 'owner',
            user: { id: 1, account: 'system', username: 'system' },
          },
          {
            userId: 2,
            role: 'viewer',
            user: { id: 2, account: 'viewer', username: 'viewer' },
          },
        ],
      },
    },
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

  @Post('/collaborators/update-role')
  @ApiOperation({
    summary: '修改文档协作者角色',
  })
  updateCollaboratorRole(
    @Req() req: TokenRequest,
    @Body() updateCollaboratorRoleDto: UpdateCollaboratorRoleDto,
  ) {
    return this.documentService.updateCollaboratorRole(
      req.user.sub,
      updateCollaboratorRoleDto.documentId,
      updateCollaboratorRoleDto.userId,
      updateCollaboratorRoleDto.role,
    );
  }
}
