import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { SpreadsheetController } from './spreadsheet.controller';
import { SpreadsheetService } from './spreadsheet.service';

@Module({
  imports: [PrismaModule],
  controllers: [SpreadsheetController],
  providers: [SpreadsheetService],
  exports: [SpreadsheetService],
})
export class SpreadsheetModule {}
