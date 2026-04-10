export const ERROR_CODES = {
  UNAUTHORIZED: { code: 401, message: '未授权，请先登录' },
  FORBIDDEN: { code: 403, message: '权限不足' },
  NOT_FOUND: { code: 404, message: '资源不存在' },
  BAD_REQUEST: { code: 400, message: '请求参数错误' },
  INTERNAL_ERROR: { code: 500, message: '服务器内部错误' },
  USER_EXISTS: { code: 1001, message: '用户已存在' },
  INVALID_CREDENTIALS: { code: 1002, message: '用户名或密码错误' },
  USER_DISABLED: { code: 1003, message: '用户已禁用' },
  RESUPPLY_ALREADY_PROCESSED: { code: 2001, message: '补装申请已处理' },
  OCR_FAILED: { code: 3001, message: 'OCR 识别失败' },
  KOOK_SYNC_FAILED: { code: 4001, message: 'KOOK 成员同步失败' },
};
