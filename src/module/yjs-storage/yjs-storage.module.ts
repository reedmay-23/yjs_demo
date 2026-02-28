import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { YjsStorageController } from './yjs-storage.controller';

@Module({
  imports: [],
  providers: [PrismaService],
  controllers: [YjsStorageController],
})
export class StorageModule {}
