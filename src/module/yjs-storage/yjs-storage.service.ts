import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as Y from 'yjs';

@Injectable()
export class YjsStorageService {
  constructor(private readonly prisma: PrismaService) {}

  // 保存快照定时器
  async saveSnapshot(id: string, doc: Y.Doc) {}

  // 读取本地数据
  async getLocalData(id: string): Promise<any> {}

  // 存储本地数据
  setLocalData(data: any) {}
}
