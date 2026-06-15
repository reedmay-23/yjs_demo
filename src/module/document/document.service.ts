import { Injectable, NotFoundException } from '@nestjs/common';
import { createSuccessResponse } from '../../common/utils/api-response.util';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDocumentDto } from './dto/create-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';

@Injectable()
export class DocumentService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createDocumentDto: CreateDocumentDto) {
    const { id, title } = createDocumentDto;
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundException('用户不存在，无法创建文档');
    }

    const res = await this.prisma.document.create({
      data: {
        content: '',
        createdBy: id,
        title,
      },
      include: {
        creator: true,
      },
    });

    return createSuccessResponse(res, {
      message: '文档创建成功',
    });
  }

  async getList(id: number) {
    const res = await this.prisma.document.findMany({
      where: {
        createdBy: id,
      },
    });

    return createSuccessResponse(res, {
      message: '获取文档列表成功',
    });
  }

  findOne(id: number) {
    return `This action returns a #${id} document`;
  }

  update(id: number, updateDocumentDto: UpdateDocumentDto) {
    void updateDocumentDto;
    return `This action updates a #${id} document`;
  }

  remove(id: number) {
    return `This action removes a #${id} document`;
  }
}
