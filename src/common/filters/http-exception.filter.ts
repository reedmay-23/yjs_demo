import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Prisma } from '../../../generated/prisma/client';
import { ResponseCode } from '../constants/response-code.constant';
import { ApiResponse } from '../interfaces/api-response.interface';

type ErrorResponseData = {
  errorId: string;
  method: string;
  path: string;
  timestamp: string;
  errorName?: string;
  stack?: string;
};

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    if (host.getType() !== 'http') {
      throw exception;
    }

    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();
    const status = this.getStatus(exception);
    const exceptionResponse = this.getExceptionResponse(exception);
    const errorId = this.createErrorId();
    const stack = exception instanceof Error ? exception.stack : undefined;
    const message = this.getResponseMessage(exceptionResponse, exception);

    this.logger.error(
      [
        `errorId=${errorId}`,
        `method=${request.method}`,
        `path=${request.originalUrl ?? request.url}`,
        `status=${status}`,
        `message=${this.getLogMessage(exceptionResponse, exception)}`,
      ].join(' '),
      stack,
    );

    const data: ErrorResponseData = {
      errorId,
      method: request.method,
      path: request.originalUrl ?? request.url,
      timestamp: new Date().toISOString(),
    };

    if (process.env.NODE_ENV !== 'production') {
      data.errorName = exception instanceof Error ? exception.name : typeof exception;
      data.stack = stack;
    }

    const body: ApiResponse<ErrorResponseData> = {
      data,
      message,
      code: this.getErrorCode(exceptionResponse, status),
    };

    response.status(status).json(body);
  }

  private getStatus(exception: unknown): number {
    if (exception instanceof HttpException) {
      return exception.getStatus();
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        case 'P2002':
          return HttpStatus.CONFLICT;
        case 'P2003':
          return HttpStatus.BAD_REQUEST;
        case 'P2025':
          return HttpStatus.NOT_FOUND;
      }
    }

    return HttpStatus.INTERNAL_SERVER_ERROR;
  }

  private getExceptionResponse(exception: unknown): unknown {
    if (exception instanceof HttpException) {
      return exception.getResponse();
    }

    return null;
  }

  private getResponseMessage(response: unknown, exception: unknown): string {
    if (exception instanceof HttpException) {
      return this.getLogMessage(response, exception);
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.getPrismaMessage(exception);
    }

    return '服务器内部错误';
  }

  private getLogMessage(response: unknown, exception: unknown): string {
    if (typeof response === 'string') {
      return response;
    }

    if (typeof response === 'object' && response !== null && 'message' in response) {
      const message = (response as { message?: string | string[] }).message;

      if (Array.isArray(message)) {
        return message.join(', ');
      }

      if (typeof message === 'string' && message.length > 0) {
        return message;
      }
    }

    if (exception instanceof Error && exception.message.length > 0) {
      return exception.message;
    }

    return '服务器内部错误';
  }

  private getErrorCode(response: unknown, status: number): number {
    if (typeof response === 'object' && response !== null && 'code' in response) {
      const code = (response as { code?: unknown }).code;
      if (typeof code === 'number') {
        return code;
      }
    }

    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return ResponseCode.BAD_REQUEST;
      case HttpStatus.CONFLICT:
        return ResponseCode.BAD_REQUEST;
      case HttpStatus.UNAUTHORIZED:
        return ResponseCode.ACCESS_TOKEN_INVALID;
      case HttpStatus.FORBIDDEN:
        return ResponseCode.FORBIDDEN;
      case HttpStatus.NOT_FOUND:
        return ResponseCode.NOT_FOUND;
      default:
        return ResponseCode.INTERNAL_ERROR;
    }
  }

  private createErrorId(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private getPrismaMessage(error: Prisma.PrismaClientKnownRequestError): string {
    switch (error.code) {
      case 'P2002':
        return '数据已存在，请勿重复提交';
      case 'P2003':
        return '关联数据不存在或已被删除';
      case 'P2025':
        return '数据不存在或已被删除';
      default:
        return '数据库操作失败';
    }
  }
}
