import { config } from 'dotenv';
config();

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { WsAdapter } from '@nestjs/platform-ws';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

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
  const swaggerOptions = new DocumentBuilder()
    .setTitle('协同文档接口文档')
    .setDescription('测试接口')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT', // 可选，提示格式
        name: 'Authorization',
        description: '请输入 JWT Token',
        in: 'header',
      },
      'access-token', // 这个 name 要和下面 @ApiBearerAuth('access-token') 一致
    )
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'Authorization',
        description: '请输入 refresh token',
        in: 'header',
      },
      'refresh-token',
    )
    .build();
  const document = SwaggerModule.createDocument(app, swaggerOptions);
  SwaggerModule.setup('swagger', app, document);
  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
}
bootstrap();
