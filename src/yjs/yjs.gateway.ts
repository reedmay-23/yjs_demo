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

@WebSocketGateway({
  path: '/collab1',
  cors: { origin: '*' },
})
export class YjsCollabGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  // 启动websocket网关服务
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(YjsCollabGateway.name);

  // 内存存储文档 (生产环境建议接入 Redis 或 数据库)
  // Key: roomId, Value: Y.Doc
  private docs: Map<string, any> = new Map();
  private connections = new Map<string, { docId: string }>();

  /**
   * @Author: mayBe
   * @Date: 2026/2/26
   * @Description: 获取房间
   * @param name docId名称
   * */
  getRoom(name: string) {
    if (!this.docs.has(name)) {
      const doc: any = new Y.Doc();
      const awareness = new awarenessProtocol.Awareness(doc);
      this.docs.set(name, { doc, awareness });
    }
    return this.docs.get(name)!;
  }
  /**-------------------------  获取房间 End -------------------------*/

  /**
   * 当客户端连接时触发
   * client: 原生 WebSocket 实例 (因为用了 WsAdapter)
   * req: HTTP IncomingMessage (包含 URL 信息)
   */
  handleConnection(client: any, req: http.IncomingMessage) {
    // 链接

    // 1. 从 URL 查询参数中获取 roomId
    // 前端连接示例: ws://localhost:3000/collab?roomId=room-123
    const params = urlParamsHandle(req);
    const roomId = params.get('docId');
    const userId = params.get('userId');
    this.logger.log('Client connected', roomId, userId);

    console.log('客户端连接', roomId, userId);

    if (!roomId) {
      this.logger.warn('Connection rejected: Missing roomId');
      client.close(4000, 'Missing roomId parameter');
      return;
    }

    // const { doc, awareness } = this.getRoom(roomId);
    // let clientID: number | null = null;

    this.logger.log(`Client joining room: ${roomId}`);

    // 3.获取doc
    if (!this.docs.has(roomId)) {
      const doc = new Y.Doc();
      const awareness = new awarenessProtocol.Awareness(doc);
      console.log('文档不存在 创建一个doc实例');
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
          `📥 [房间: ${roomId}] 收到更新! 大小: ${update.byteLength} bytes, 来源: ${origin}`,
        );

        // --- 在这里执行你的业务逻辑 ---

        // // 1. 持久化到数据库 (防抖处理建议在生产环境加上)
        // this.saveToDatabase(name, update).catch((err) => {
        //   this.logger.error('保存失败', err);
        // });

        // 2. 广播给其他服务 (如果需要微服务架构)
        // this.redis.publish(`yjs:${name}`, Buffer.from(update));

        // // 3. 触发其他业务逻辑 (例如：发送通知、检查敏感词等)
        // // 注意：这里拿不到具体的文本内容，只有二进制 update。
        // // 如果需要文本内容，需要从 doc 中读取: const text = doc.getText('content').toString();
        // const currentText = doc.getText('content').toString();
        // this.logger.debug(`当前文档全文: ${currentText.substring(0, 50)}...`);
      });

      // // 可选：加载历史数据
      // this.loadFromDatabase(name).then((data) => {
      //   if (data) {
      //     Y.applyUpdate(doc, data);
      //     this.logger.log(`✅ [房间: ${name}] 历史数据加载完成`);
      //   }
      // });

      this.docs.set(roomId, { doc, awareness });
      this.logger.log(`创建新房间: ${roomId}`);
    }
    const { doc, awareness } = this.docs.get(roomId)!;
    console.log('文档存在 获取一个doc实例');

    // 4. 【核心】将 WebSocket 连接交给 y-websocket 处理
    // setupWSConnection 会自动处理：
    // - Sync Protocol (同步文档内容)
    // - Awareness Protocol (同步光标/状态)
    // - 二进制消息编解码
    setupWSConnection(client, req, {
      docName: roomId,
      doc: doc,
      awareness: awareness,
      gc: true, // 可选：启用垃圾回收
    });

    this.logger.log(`Yjs protocol established for room: ${roomId}`);
  }
  handleDisconnect(client: any): any {
    console.log('客户端断开连接:');
  }
}
