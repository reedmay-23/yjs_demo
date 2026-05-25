import { Injectable, Logger, LoggerService } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// 用来增上改查用户表

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);
  constructor(private readonly prisma: PrismaService) {}
}
