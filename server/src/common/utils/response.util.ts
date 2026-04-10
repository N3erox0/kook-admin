export interface ApiResponse<T = any> {
  code: number;
  message: string;
  data: T;
}

export function success<T>(data: T, message = '操作成功'): ApiResponse<T> {
  return { code: 0, message, data };
}

export function error(code: number, message: string): ApiResponse<null> {
  return { code, message, data: null };
}

export interface PaginatedResult<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
}

export function paginated<T>(list: T[], total: number, page: number, pageSize: number): ApiResponse<PaginatedResult<T>> {
  return success({ list, total, page, pageSize });
}
