#!/bin/bash
# ============================================
# KOOK 公会管理系统 - 服务器更新脚本
# 用法: bash deploy.sh
# ============================================

set -e

# ===== 配置区域（根据实际环境修改） =====
APP_DIR="/opt/kook-admin"
REPO_URL="https://github.com/N3erox0/kook-admin.git"
BRANCH="main"
PM2_SERVER_NAME="kook-server"
PM2_CLIENT_NAME="kook-client"
MIGRATION_DIR="$APP_DIR/server/src/database/migrations"

# 颜色
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log()  { echo -e "${GREEN}[$(date '+%H:%M:%S')] ✓ $1${NC}"; }
warn() { echo -e "${YELLOW}[$(date '+%H:%M:%S')] ⚠ $1${NC}"; }
err()  { echo -e "${RED}[$(date '+%H:%M:%S')] ✗ $1${NC}"; exit 1; }

echo ""
echo "============================================"
echo "  KOOK 公会管理系统 - 服务器更新"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "============================================"
echo ""

# ===== 1. 拉取最新代码 =====
log "拉取最新代码..."
cd "$APP_DIR" || err "目录 $APP_DIR 不存在"
git fetch origin "$BRANCH"
git reset --hard "origin/$BRANCH"
log "代码更新完成 ($(git log -1 --format='%h %s'))"

# ===== 2. 执行数据库迁移 =====
log "检查数据库迁移..."

# 从 .env 读取数据库配置
if [ -f "$APP_DIR/server/.env" ]; then
    source <(grep -E '^(DB_HOST|DB_PORT|DB_USERNAME|DB_PASSWORD|DB_DATABASE)=' "$APP_DIR/server/.env")
fi

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-3306}"
DB_USERNAME="${DB_USERNAME:-root}"
DB_DATABASE="${DB_DATABASE:-kook_admin}"

# 创建迁移记录表（如果不存在）
mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USERNAME" -p"$DB_PASSWORD" "$DB_DATABASE" -e "
  CREATE TABLE IF NOT EXISTS _migrations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    filename VARCHAR(255) NOT NULL UNIQUE,
    executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
" 2>/dev/null

# 逐个执行未运行的迁移
MIGRATION_COUNT=0
for sql_file in $(ls "$MIGRATION_DIR"/*.sql 2>/dev/null | sort); do
    filename=$(basename "$sql_file")
    already=$(mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USERNAME" -p"$DB_PASSWORD" "$DB_DATABASE" -N -e "
      SELECT COUNT(*) FROM _migrations WHERE filename='$filename';
    " 2>/dev/null)

    if [ "$already" = "0" ]; then
        log "执行迁移: $filename"
        mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USERNAME" -p"$DB_PASSWORD" "$DB_DATABASE" < "$sql_file"
        mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USERNAME" -p"$DB_PASSWORD" "$DB_DATABASE" -e "
          INSERT INTO _migrations (filename) VALUES ('$filename');
        "
        MIGRATION_COUNT=$((MIGRATION_COUNT + 1))
    fi
done

if [ "$MIGRATION_COUNT" -gt 0 ]; then
    log "已执行 $MIGRATION_COUNT 个迁移"
else
    log "无新迁移需要执行"
fi

# ===== 3. 后端更新 =====
log "安装后端依赖..."
cd "$APP_DIR/server"
npm install --production=false 2>&1 | tail -1

log "构建后端..."
npm run build 2>&1 | tail -3

log "重启后端服务..."
if pm2 describe "$PM2_SERVER_NAME" > /dev/null 2>&1; then
    pm2 restart "$PM2_SERVER_NAME"
else
    pm2 start dist/main.js --name "$PM2_SERVER_NAME"
fi
log "后端服务已重启"

# ===== 4. 前端更新 =====
log "安装前端依赖..."
cd "$APP_DIR/client"
npm install 2>&1 | tail -1

log "构建前端..."
npm run build 2>&1 | tail -3

# 如果前端用 Nginx 静态托管，复制 dist 到 Nginx 目录
NGINX_DIR="/var/www/kook-admin"
if [ -d "$NGINX_DIR" ]; then
    rm -rf "$NGINX_DIR"/*
    cp -r dist/* "$NGINX_DIR"/
    log "前端已部署到 $NGINX_DIR"
elif pm2 describe "$PM2_CLIENT_NAME" > /dev/null 2>&1; then
    pm2 restart "$PM2_CLIENT_NAME"
    log "前端服务已重启"
else
    warn "前端构建完成，请手动部署 dist 目录"
fi

# ===== 5. 健康检查 =====
log "执行健康检查..."
sleep 3

# 检查后端进程
if pm2 describe "$PM2_SERVER_NAME" 2>/dev/null | grep -q "online"; then
    log "后端服务: 运行中"
else
    err "后端服务启动失败！请检查日志: pm2 logs $PM2_SERVER_NAME"
fi

# 检查端口
SERVER_PORT=$(grep -E '^APP_PORT=' "$APP_DIR/server/.env" 2>/dev/null | cut -d'=' -f2)
SERVER_PORT="${SERVER_PORT:-3000}"
if curl -sf "http://localhost:$SERVER_PORT/api/health" > /dev/null 2>&1 || \
   curl -sf "http://localhost:$SERVER_PORT" > /dev/null 2>&1; then
    log "API 端口 $SERVER_PORT: 正常响应"
else
    warn "API 端口 $SERVER_PORT: 无响应（可能仍在启动中）"
fi

# ===== 完成 =====
echo ""
echo "============================================"
echo -e "  ${GREEN}更新完成！${NC}"
echo "  提交: $(cd "$APP_DIR" && git log -1 --format='%h - %s')"
echo "  迁移: $MIGRATION_COUNT 个新迁移"
echo "  时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo "============================================"
echo ""
echo "常用命令:"
echo "  pm2 logs $PM2_SERVER_NAME    # 查看后端日志"
echo "  pm2 status                   # 查看进程状态"
echo "  pm2 restart $PM2_SERVER_NAME # 重启后端"
