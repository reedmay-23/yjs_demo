import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client/extension';

@Injectable()
export class PrismaService
  extends PrismaClient<any>
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super();
  }

  async onModuleInit() {
    await this.$connect(); // 连接数据库

    // // 监听查询日志
    // this.$on('query', (e: Prisma.QueryEvent) => {
    //   console.log(`SQL: ${e.query}`)
    //   console.log(`参数: ${e.params}`)
    //   console.log(`执行时间: ${e.duration} ms`)
    // })
    //
    // // 监听其他日志
    // this.$on('info', (e: Prisma.LogEvent) => {
    //   console.log(`Info: ${e.message}`)
    // })
    //
    // this.$on('warn', (e: Prisma.LogEvent) => {
    //   console.log(`Warn: ${e.message}`)
    // })
    //
    // this.$on('error', (e: Prisma.LogEvent) => {
    //   console.log(`Error: ${e.message}`)
    // })
  }

  async onModuleDestroy() {
    await this.$disconnect(); // 断开数据库
  }
}
