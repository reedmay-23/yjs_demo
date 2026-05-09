import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { YjsStorageController } from './yjs-storage.controller';
import { YjsStorageService } from './yjs-storage.service';

@Module({
  imports: [PrismaModule],
  controllers: [YjsStorageController],
  providers: [YjsStorageService],
  exports: [YjsStorageService],
})
export class StorageModule {}
