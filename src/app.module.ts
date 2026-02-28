import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SocketGateway } from './socket/socket.gateway';
import { CollabGateway } from './collab/collab.gatewat';
import { YjsCollabGateway } from './yjs/yjs.gateway';
import { YjsStorageService } from './module/yjs-storage/yjs-storage.service';
// import { PrismaService } from './module/prisma/prisma.service';

@Module({
  imports: [],
  controllers: [AppController],
  providers: [
    AppService,
    SocketGateway,
    CollabGateway,
    YjsCollabGateway,
    YjsStorageService,
  ],
  // PrismaService,
})
export class AppModule {}
