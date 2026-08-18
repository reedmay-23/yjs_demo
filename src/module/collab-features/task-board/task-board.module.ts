import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { TaskBoardController } from './task-board.controller';
import { TaskBoardService } from './task-board.service';

@Module({
  imports: [PrismaModule],
  controllers: [TaskBoardController],
  providers: [TaskBoardService],
  exports: [TaskBoardService],
})
export class TaskBoardModule {}
