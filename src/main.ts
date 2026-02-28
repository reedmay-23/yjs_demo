import { config } from 'dotenv';
config();

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { WsAdapter } from '@nestjs/platform-ws';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // ✅ 关键：启用原生 WebSocket 适配器
  // 这样 @WebSocketGateway 将使用 'ws' 库而不是 'socket.io'
  app.useWebSocketAdapter(new WsAdapter(app));
  // 如果需要跨域
  app.enableCors({
    origin: '*', // 生产环境请替换为你的前端域名
    methods: ['GET', 'POST'],
  });

  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
}
bootstrap();
