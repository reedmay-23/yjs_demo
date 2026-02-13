import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import * as Y from 'yjs';

@WebSocketGateway({
  cors: { origin: '*' },
  path: '/collab',
})
export class CollabGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  // 内存数据结构
  private docs = new Map<string, Y.Doc>();
  private connections = new Map<string, { docId: string }>();

  count = 1;

  // 初始化成功操作
  afterInit(server: any) {
    console.log('WebSocket 网关已初始化');
  }

  // 链接成功操作
  handleConnection(client: any, ...args: any[]) {
    console.log('客户端连接:', client.id);
  }

  // 断链操作
  handleDisconnect(client: any): any {
    console.log('客户端断开连接:', client.id);
  }

  // 加入房间
  @SubscribeMessage('join')
  handleJoin(client: Socket, payload: any): any {
    const { docId } = payload;
    console.log('用户加入房间', docId);
    client.join(docId);
    this.connections.set(client.id, { docId });

    // 获取或创建文档
    if (!this.docs.has(docId)) {
      this.docs.set(docId, new Y.Doc());
    }
    const doc = this.docs.get(docId)!;

    const update = Y.encodeStateAsUpdate(doc);
    client.emit('initDoc', {
      docId,
      update: Array.from(update),
      docs: this.docs,
    });
  }

  // 接受用户端更新
  @SubscribeMessage('update')
  handleUpdate(client: Socket, payload: any): any {
    const { docId, update } = payload;
    console.log(update, docId, '发送更新');
    if (!this.docs.has(docId)) return;

    try {
      const doc = this.docs.get(docId);
      const updateUint8 = Uint8Array.from(update);
      console.log(updateUint8, 'uint8');
      // 应用更新到服务端 Y.Doc（用于后续新用户加入时提供完整状态）
      Y.applyUpdate(doc, updateUint8);
      console.log(Array.from(this.server.sockets.adapter.rooms.get(docId)));
      // 广播给房间内其他用户（不包括自己）
      client.broadcast.to(docId).emit('update', {
        docId,
        update: payload.update, // 直接转发
        senderId: client.id,
      });
    } catch (error) {
      console.error(error);
    }
  }
}
