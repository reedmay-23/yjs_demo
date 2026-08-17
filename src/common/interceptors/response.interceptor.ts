import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { ResponseCode } from '../constants/response-code.constant';
import { ApiResponse } from '../interfaces/api-response.interface';
import { isServiceApiResponse } from '../utils/api-response.util';

@Injectable()
export class ResponseInterceptor<T>
  implements NestInterceptor<T, ApiResponse<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponse<T>> {
    if (context.getType() !== 'http') {
      return next.handle() as Observable<ApiResponse<T>>;
    }

    return next.handle().pipe(
      map((data) => this.formatSuccessResponse(data) as ApiResponse<T>),
    );
  }

  private formatSuccessResponse(data: unknown): ApiResponse<unknown> {
    if (isServiceApiResponse(data)) {
      return {
        data: data.data ?? null,
        message: data.message ?? 'success',
        code: data.code ?? ResponseCode.SUCCESS,
      };
    }

    return {
      data: data ?? null,
      message: 'success',
      code: ResponseCode.SUCCESS,
    };
  }
}
