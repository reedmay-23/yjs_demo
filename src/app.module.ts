import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { AuthModule } from './module/auth/auth.module';
import { DocumentModule } from './module/document/document.module';
import { PrismaModule } from './module/prisma/prisma.module';
import { StorageModule } from './module/yjs-storage/yjs-storage.module';
import { UserModule } from './module/user/user.module';
import { SocketGateway } from './socket/socket.gateway';
import { YjsPersistenceGateway } from './yjs/yjs-persistence.gateway';
import { YjsCollabGateway } from './yjs/yjs.gateway';
import { CollabFeaturesGateway } from './yjs/collab-features.gateway';

// 新功能模块
import { WhiteboardModule } from './module/collab-features/whiteboard/whiteboard.module';
import { ChatModule } from './module/collab-features/chat/chat.module';
import { TaskBoardModule } from './module/collab-features/task-board/task-board.module';
import { SpreadsheetModule } from './module/collab-features/spreadsheet/spreadsheet.module';
import { MediaModule } from './module/collab-features/media/media.module';

@Module({
  imports: [
    PrismaModule,
    StorageModule,
    AuthModule,
    DocumentModule,
    UserModule,
    // 新功能模块
    WhiteboardModule,
    ChatModule,
    TaskBoardModule,
    SpreadsheetModule,
    MediaModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    SocketGateway,
    YjsCollabGateway,
    YjsPersistenceGateway,
    CollabFeaturesGateway,
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseInterceptor,
    },
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
  ],
})
export class AppModule {}
