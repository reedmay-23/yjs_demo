import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { YjsStorageController } from './yjs-storage.controller';
import { YjsRoomEventsService } from './yjs-room-events.service';
import { YjsStorageService } from './yjs-storage.service';

@Module({
  imports: [PrismaModule],
  controllers: [YjsStorageController],
  providers: [YjsStorageService, YjsRoomEventsService],
  exports: [YjsStorageService, YjsRoomEventsService],
})
export class StorageModule {}
