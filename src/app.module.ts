import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CollabGateway } from './collab/collab.gatewat';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { AuthModule } from './module/auth/auth.module';
import { DocumentModule } from './module/document/document.module';
import { PrismaModule } from './module/prisma/prisma.module';
import { StorageModule } from './module/yjs-storage/yjs-storage.module';
import { SocketGateway } from './socket/socket.gateway';
import { YjsPersistenceGateway } from './yjs/yjs-persistence.gateway';
import { YjsCollabGateway } from './yjs/yjs.gateway';

@Module({
  imports: [PrismaModule, StorageModule, AuthModule, DocumentModule],
  controllers: [AppController],
  providers: [
    AppService,
    SocketGateway,
    CollabGateway,
    YjsCollabGateway,
    YjsPersistenceGateway,
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseInterceptor,
    },
  ],
})
export class AppModule {}
