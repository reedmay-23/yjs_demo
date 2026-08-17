import { ResponseCode } from '../constants/response-code.constant';
import { ApiResponse } from '../interfaces/api-response.interface';

const RESPONSE_META_KEY = Symbol('response_meta_key');

export type ServiceApiResponse<T = unknown> = ApiResponse<T> & {
  [RESPONSE_META_KEY]: true;
};

type ServiceApiResponseOptions<T> = Partial<ApiResponse<T>>;

export function createSuccessResponse<T>(
  data: T,
  options: ServiceApiResponseOptions<T> = {},
): ServiceApiResponse<T> {
  return Object.defineProperty(
    {
      data,
      message: options.message ?? 'success',
      code: options.code ?? ResponseCode.SUCCESS,
    },
    RESPONSE_META_KEY,
    {
      value: true,
      enumerable: false,
    },
  ) as ServiceApiResponse<T>;
}

export function createEmptyResponse(
  options: ServiceApiResponseOptions<null> = {},
): ServiceApiResponse<null> {
  return createSuccessResponse(options.data ?? null, options);
}

export function isServiceApiResponse(
  value: unknown,
): value is ServiceApiResponse<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    RESPONSE_META_KEY in (value as Record<PropertyKey, unknown>)
  );
}
