import { Injectable, Logger } from '@nestjs/common';
import { createSuccessResponse } from '../../common/utils/api-response.util';
import { PrismaService } from '../prisma/prisma.service';

// 用来增上改查用户表

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);
  constructor(private readonly prisma: PrismaService) {}

  async search(keyword = '') {
    const normalizedKeyword = keyword.trim();

    if (!normalizedKeyword) {
      return createSuccessResponse([], {
        message: '搜索用户成功',
      });
    }

    const users = await this.prisma.user.findMany({
      where: {
        OR: [
          {
            account: {
              contains: normalizedKeyword,
              mode: 'insensitive',
            },
          },
          {
            username: {
              contains: normalizedKeyword,
              mode: 'insensitive',
            },
          },
        ],
      },
      select: {
        id: true,
        account: true,
        username: true,
      },
      orderBy: {
        id: 'asc',
      },
      take: 20,
    });

    return createSuccessResponse(
      users.map((user) => ({
        id: user.id,
        account: user.account,
        name: user.username,
        username: user.username,
      })),
      {
        message: '搜索用户成功',
      },
    );
  }
}
