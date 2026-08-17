import { Module } from '@nestjs/common';
import { DocumentService } from './document.service';
import { DocumentController } from './document.controller';
import { PrismaService } from '../prisma/prisma.service';
import { StorageModule } from '../yjs-storage/yjs-storage.module';

@Module({
  imports: [StorageModule],
  controllers: [DocumentController],
  providers: [DocumentService, PrismaService],
})
export class DocumentModule {}
