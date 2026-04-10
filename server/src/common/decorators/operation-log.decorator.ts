import { SetMetadata } from '@nestjs/common';

export const OPERATION_LOG_KEY = 'operation_log';

export interface OperationLogMeta {
  module: string;
  action: string;
}

export const OperationLog = (meta: OperationLogMeta) =>
  SetMetadata(OPERATION_LOG_KEY, meta);
