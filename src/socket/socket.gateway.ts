import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: { origin: '*' },
  path: '/socket',
})
export class SocketGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  count = 1;
  afterInit(server: Server) {
    console.log('WebSocket 网关已初始化');
  }

  handleConnection(client: Socket, ...args: any[]) {
    console.log('客户端连接:', client.id);
    setInterval(() => {
      this.count++;
      client.emit('message', this.count);
    }, 2000);
  }

  handleDisconnect(client: Socket) {
    console.log('客户端断开连接:', client.id);
  }

  @SubscribeMessage('message')
  handleMessage(client: Socket, payload: any) {
    console.log('瘦到消息', payload);

    this.server.emit('message', payload);
  }
}
