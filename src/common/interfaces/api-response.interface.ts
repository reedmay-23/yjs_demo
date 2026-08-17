export interface ApiResponse<T = unknown> {
  data: T | null;
  message: string;
  code: number;
}
