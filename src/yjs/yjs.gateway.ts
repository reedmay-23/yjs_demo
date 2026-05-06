import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server } from 'ws'; // 注意这里引入的是 ws 的 Server
import * as Y from 'yjs';
import { Logger } from '@nestjs/common';
import * as http from 'node:http';
import * as awarenessProtocol from 'y-protocols/awareness';
import { setupWSConnection } from 'y-websocket/bin/utils';
import { urlParamsHandle } from '../utils/urlParams';
import { YjsStorageService } from '../module/yjs-storage/yjs-storage.service';

interface RoomData {
  doc: Y.Doc; // doc实例
  awareness: awarenessProtocol.Awareness; // 光标同步信息
  connectionCount: number; // 房间链接数
  cleanupTimer?: NodeJS.Timeout; // 清除倒计时
  snapshotTimer?: NodeJS.Timeout; // 原有的快照定时器
  docId: any;
  roomId: any;
}

@WebSocketGateway({
  path: '/collab1',
  cors: { origin: '*' },
})
export class YjsCollabGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  constructor(private readonly storageService: YjsStorageService) {}
  // 启动websocket网关服务
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(YjsCollabGateway.name);

  // 内存存储文档 (生产环境建议接入 Redis 或 数据库)
  // Key: docId, Value: Y.Doc
  private docs: Map<string, RoomData> = new Map();
  private connections = new Map<string, { docId: string }>();

  /**
   * @Author: mayBe
   * @Date: 2026/2/26
   * @Description: 获取房间
   * @param docId docId名称
   * @param userId userId
   * */
  async getRoom(docId: any, userId: number) {
    // 获取doc
    const storgeDoc = await this.storageService.getDocument(docId);
    // 如果文档不存在
    if (!storgeDoc) {
      this.logger.error('文档不存在，服务其强制用户断开连接');
      return;
    }
    // 文档存在，查看是否存在会话空间
    const session = await this.storageService.handleSessionRoom(docId, userId);

    // 3.获取doc docs相当于存储的文档的会话
    // 内存不存在会话 同步数据库会话
    if (!this.docs.has(docId)) {
      console.log('文档在内存不存在 创建一个doc实例 同步数据库的会话');
      const storedUnit8Array = new Uint8Array(storgeDoc.content);
      const doc = new Y.Doc();
      const awareness = new awarenessProtocol.Awareness(doc);

      // 内存同步 数据库变更
      Y.applyUpdate(doc, storedUnit8Array);
      // ---------------------------------------------------------
      // 🎯 核心：在这里监听 update 事件，这就是“接收”更改的地方
      // ---------------------------------------------------------
      doc.on('update', (update: Uint8Array, origin: any) => {
        // 参数说明:
        // update: Uint8Array 类型的二进制增量数据 (Delta)
        // origin: 触发更新的来源。
        //    - 如果是来自 WebSocket 客户端的同步，origin 通常是 undefined 或 'sync'
        //    - 如果是本地加载数据触发的，可能是 'load'
        this.logger.log(
          `📥 [房间: ${docId}] 收到更新! 大小: ${update.byteLength} bytes, 来源: ${origin}`,
        );

        // --- 在这里执行你的业务逻辑 ---

        // 1. 持久化到数据库 (防抖处理建议在生产环境加上)
        this.saveToDatabase(docId, update).catch((err) => {
          this.logger.error('保存失败', err);
        });

        // 2. 广播给其他服务 (如果需要微服务架构)
        // this.redis.publish(`yjs:${name}`, Buffer.from(update));

        // // 3. 触发其他业务逻辑 (例如：发送通知、检查敏感词等)
        // // 注意：这里拿不到具体的文本内容，只有二进制 update。
        // // 如果需要文本内容，需要从 doc 中读取: const text = doc.getText('content').toString();
        // const currentText = doc.getText('content').toString();
        // this.logger.debug(`当前文档全文: ${currentText.substring(0, 50)}...`);
      });

      // // 从数据库获取是否有历史数据：加载历史文档数据

      // 查看数据库是否有该doc文档
      const res = await this.storageService.getLocalData(docId);

      // 如果文档不存在说明 没有这个文档报错
      if (!res) {
        this.logger.error(`查询的这个文档不存在 断开用户连接`, docId);
        throw '文档不存在';
      }

      // this.loadFromDatabase(name).then((data) => {
      //   if (data) {
      //     Y.applyUpdate(doc, data);
      //     this.logger.log(`✅ [房间: ${name}] 历史数据加载完成`);
      //   }
      // });

      // // 启动定期快照 (例如每5分钟)
      // const snapshotTimer = setInterval(
      //   () => {
      //     // 调用存储服务 将doc实例存储到本地
      //     this.storageService
      //       .saveSnapshot(docId, doc)
      //       .catch((err) => this.logger.error(`快照失败 ${docId}`, err));
      //   },
      //   5 * 60 * 1000,
      // );

      this.docs.set(session.id, {
        docId,
        doc,
        awareness,
        connectionCount: 0,
        cleanupTimer: undefined,
        roomId: session.id,
        // snapshotTimer,
      });
      this.logger.log(`创建新文档:房间号 ${session.id}`);
    }
    return this.docs.get(session.id)!;
  }
  /**-------------------------  获取房间 End -------------------------*/

  /**
   * 当客户端连接时触发
   * client: 原生 WebSocket 实例 (因为用了 WsAdapter)
   * req: HTTP IncomingMessage (包含 URL 信息)
   */
  // 配置：无人连接多少分钟后清理 (毫秒)
  private readonly CLEANUP_DELAY_MS = 30 * 60 * 1000;

  async handleConnection(client: any, req: http.IncomingMessage) {
    // 链接

    // 1. 从 URL 查询参数中获取 docId
    // 前端连接示例: ws://localhost:3000/collab?docId=room-123
    const params = urlParamsHandle(req);
    const docId = params.get('docId');
    const userId = params.get('userId');
    this.logger.log(`Client connected 客户端连接：${docId} ${userId}`);

    // 传参没有docId 文档
    if (!docId) {
      this.logger.warn('Connection rejected: Missing docId');
      client.close(4000, 'Missing docId parameter');
      return;
    }

    // 文档操作 doc不存在直接推出 存在返回roomId
    // const roomId = await this.handleDocument(docId, client, userId);
    // this.logger.log(`Client joining room: ${roomId}`);

    const room = await this.getRoom(docId, userId);

    // 有人进房间 如果这个房间处于要被清除阶段 取消清除状态
    if (room.cleanupTimer) {
      clearTimeout(room.cleanupTimer);
      room.cleanupTimer = undefined;
      this.logger.log(`♻️ 房间 ${room.roomId} 恢复活跃，取消清理计划`);
    }

    client.roomId = docId;
    room.connectionCount++;

    // 4. 【核心】将 WebSocket 连接交给 y-websocket 处理
    // setupWSConnection 会自动处理：
    // - Sync Protocol (同步文档内容)
    // - Awareness Protocol (同步光标/状态)
    // - 二进制消息编解码
    setupWSConnection(client, req, {
      docName: room.roomId,
      doc: room.doc,
      awareness: room.awareness,
      gc: true, // 可选：启用垃圾回收
    });

    this.logger.log(`Yjs protocol established for room: ${room.roomId}`);
  }
  handleDisconnect(client: any): any {
    console.log('客户端断开连接:', client.roomId);
    const roomId = client.roomId;
    if (!roomId || !this.docs.has(roomId)) return;

    const room = this.docs.get(client.roomId);
    room.connectionCount--;

    this.logger.log(
      `🔌 [${roomId}] 断开连接。当前在线人数: ${room.connectionCount}`,
    );
    // 判断房间内没人了 执行清除倒计时
    if (room.connectionCount <= 0) {
      this.logger.warn(
        `⚠️ [${roomId}] 无人连接，启动 ${this.CLEANUP_DELAY_MS / 1000}s 后清理倒计时...`,
      );

      room.cleanupTimer = setTimeout(() => {
        // 双重检查：确保此时真的没人了（防止竞态条件）
        if (room.connectionCount <= 0) {
          // 删除房间
          // this.destroyRoom(roomId);
        } else {
          this.logger.log(`✅ [${roomId}] 倒计时期间有人重新连接，取消清理`);
        }
      }, this.CLEANUP_DELAY_MS);
    }
  }

  /**
   * @Author: mayBe
   * @Date: 2026/3/25
   * @Description: 文档操作
   * */
  async handleDocument(docId: any, client: any, userId: any) {
    // 检查数据库看是否存在这个文档
    const res = await this.storageService.getDocument(docId);
    // 如果文档不存在
    if (!res) {
      this.logger.error('文档不存在，服务其强制用户断开连接');
      return;
    }
    // 文档存在，查看是否存在会话空间
    const session = await this.storageService.handleSessionRoom(docId, userId);
    return session.id;
  }
  /**-------------------------  文档操作 End -------------------------*/

  /**
   * @Author: mayBe
   * @Date: 2026/3/25
   * @Description: 存储数据到数据库
   * */
  async saveToDatabase(docId: string, update: Uint8Array): Promise<void> {
    try {
      // 将 Uint8Array 转换为 Buffer 以便存储到数据库
      const updateBuffer = Buffer.from(update);

      // 使用 upsert 操作：
      // - 如果记录存在 (where 条件匹配)，则更新 content 和 updatedAt 字段
      // - 如果记录不存在，则创建新记录
      // await this.prisma.ydocStorage.upsert({
      //   where: {
      //     docId: docId, // 假设 docId 是 YDocStorage 表的唯一索引
      //   },
      //   update: {
      //     content: updateBuffer, // 更新文档内容
      //     updatedAt: new Date(), // 更新时间戳
      //   },
      //   create: {
      //     docId: docId, // 创建新记录
      //     content: updateBuffer,
      //     createdAt: new Date(),
      //     updatedAt: new Date(),
      //   },
      // });

      console.log(`文档 ${docId} 已成功保存到数据库。`);
    } catch (error) {
      console.error(`保存文档 ${docId} 到数据库失败:`, error);
      throw error; // 重新抛出错误，让调用方处理
    }
  }
  /**-------------------------  存储数据到数据库 End -------------------------*/
}
