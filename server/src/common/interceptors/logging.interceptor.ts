import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Inject,
  Optional,
  Logger,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { Reflector } from '@nestjs/core';
import { OPERATION_LOG_KEY, OperationLogMeta } from '../decorators/operation-log.decorator';
import { LogService } from '../../modules/log/log.service';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  constructor(
    private reflector: Reflector,
    @Optional() @Inject(LogService) private logService?: LogService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const meta = this.reflector.get<OperationLogMeta>(
      OPERATION_LOG_KEY,
      context.getHandler(),
    );

    if (!meta) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const now = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const logEntry = {
            userId: user?.userId || user?.sub || user?.id,
            username: user?.username,
            module: meta.module,
            action: meta.action,
            targetType: request.params?.id ? 'record' : 'list',
            targetId: request.params?.id ? parseInt(request.params.id) : null,
            requestParams: this.sanitizeParams(request.body),
            responseStatus: 200,
            ipAddress: request.ip || request.headers['x-forwarded-for'],
            userAgent: request.headers['user-agent'],
          };

          // 写入数据库（异步，不阻塞响应）
          if (this.logService) {
            this.logService.create(logEntry).catch((err) => {
              this.logger.error(`写入操作日志失败: ${err.message}`);
            });
          }
        },
        error: (err) => {
          const logEntry = {
            userId: user?.userId || user?.sub || user?.id,
            username: user?.username,
            module: meta.module,
            action: meta.action,
            targetType: request.params?.id ? 'record' : 'list',
            targetId: request.params?.id ? parseInt(request.params.id) : null,
            requestParams: this.sanitizeParams(request.body),
            responseStatus: err.status || 500,
            ipAddress: request.ip || request.headers['x-forwarded-for'],
            userAgent: request.headers['user-agent'],
          };

          if (this.logService) {
            this.logService.create(logEntry).catch((logErr) => {
              this.logger.error(`写入错误日志失败: ${logErr.message}`);
            });
          }
        },
      }),
    );
  }

  private sanitizeParams(params: any): any {
    if (!params) return null;
    const sanitized = { ...params };
    const sensitiveFields = ['password', 'passwordHash', 'token', 'secret'];
    for (const field of sensitiveFields) {
      if (sanitized[field]) {
        sanitized[field] = '***';
      }
    }
    return sanitized;
  }
}
