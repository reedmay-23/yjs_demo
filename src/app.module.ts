import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CollabGateway } from './collab/collab.gatewat';
import { AuthModule } from './module/auth/auth.module';
import { PrismaModule } from './module/prisma/prisma.module';
import { StorageModule } from './module/yjs-storage/yjs-storage.module';
import { SocketGateway } from './socket/socket.gateway';
import { YjsPersistenceGateway } from './yjs/yjs-persistence.gateway';
import { YjsCollabGateway } from './yjs/yjs.gateway';

@Module({
  imports: [PrismaModule, StorageModule, AuthModule],
  controllers: [AppController],
  providers: [
    AppService,
    SocketGateway,
    CollabGateway,
    YjsCollabGateway,
    YjsPersistenceGateway,
  ],
})
export class AppModule {}
