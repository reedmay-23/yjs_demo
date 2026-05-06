import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as Y from 'yjs';

@Injectable()
export class YjsStorageService {
  // private readonly prisma: PrismaService
  constructor(private prisma: PrismaService) {}

  // 保存快照定时器
  async saveSnapshot(id: string, doc: Y.Doc) {}

  // 读取本地数据
  /**
   *
   * @param id 文档id
   */
  async getLocalData(id: any): Promise<any> {
    console.log(id, 'id');
    // this.prisma.user.findMany({});
    const res = await this.prisma.document.findUnique({
      where: {
        id,
      },
    });
    console.log(res, '看看是否存在, 本地不存在创建一个文档信息');
    return res;
  }

  async getDocument(id: any): Promise<any> {
    return await this.prisma.document.findUnique({
      where: {
        id,
      },
    });
  }
  // 创建一个文档
  async createDocument(doc: any): Promise<any> {
    // await this.prisma.document.create({});
  }

  // 获取会话房间
  async getSessionInfo(docId: any): Promise<any> {
    const res = await this.prisma.collaborationSession.findFirst({
      where: {
        documentId: docId,
      },
    });
    return res?.id;
  }
  // 创建会话
  async createSessionRoom(docId: any, userId: any): Promise<any> {
    const res = await this.prisma.collaborationSession.create({
      data: {
        documentId: docId,
        userId: userId,
      },
    });
    return res;
  }
  // 会话房间相关逻辑
  async handleSessionRoom(docId: any, userId: any): Promise<any> {
    const session = await this.prisma.collaborationSession.upsert({
      where: {
        documentId_userId: {
          documentId: docId,
          userId: userId,
        },
      },
      update: {},
      create: {
        documentId: docId,
        userId,
      },
    });
    return session;
  }

  // 存储本地数据
  setLocalData(data: any) {}
}
