import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SocketGateway } from './socket/socket.gateway';
import { CollabGateway } from './collab/collab.gatewat';
import { YjsCollabGateway } from './yjs/yjs.gateway';
import { YjsPersistenceGateway } from './yjs/yjs-persistence.gateway';
import { PrismaModule } from './module/prisma/prisma.module';
import { StorageModule } from './module/yjs-storage/yjs-storage.module';
import { AuthModule } from './module/auth/auth.module';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from './utils/jwt.config';

@Module({
  imports: [PrismaModule, StorageModule, AuthModule],
  controllers: [AppController],
  providers: [
    AppService,
    SocketGateway,
    CollabGateway,
    YjsCollabGateway,
    YjsPersistenceGateway,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
