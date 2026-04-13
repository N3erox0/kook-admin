#!/bin/bash
set -e

APP_DIR="/opt/kook-admin"
BAK_ENV="/opt/kook-admin-bak-20260411021332/server/.env"
PM2_NAME="kook-admin-server"

echo "===== KOOK Admin 一键部署 ====="

# 1. 拉取代码（自动尝试多个镜像源）
cd /opt
for MIRROR in "" "https://mirror.ghproxy.com/" "https://gitclone.com/"; do
  URL="${MIRROR}https://github.com/N3erox0/kook-admin.git"
  echo "[1/5] 尝试拉取: $URL"
  rm -rf kook-admin
  if git clone "$URL" --branch main --depth 1 2>/dev/null; then
    echo "[1/5] 拉取成功!"
    break
  fi
  echo "[1/5] 该镜像失败，尝试下一个..."
done

if [ ! -d "$APP_DIR" ]; then
  echo "所有镜像均失败，请检查网络后重试"
  exit 1
fi

# 2. 恢复 .env
echo "[2/5] 恢复 .env 配置..."
if [ -f "$BAK_ENV" ]; then
  cp "$BAK_ENV" "$APP_DIR/server/.env"
  echo "[2/5] .env 已恢复"
else
  echo "[2/5] 警告: 备份 .env 不存在($BAK_ENV)，请手动配置"
fi

# 3. 后端构建
echo "[3/5] 后端: npm install + build..."
cd "$APP_DIR/server"
npm install --production=false 2>&1 | tail -1
npm run build 2>&1 | tail -1
echo "[3/5] 后端构建完成"

# 4. 重启后端
echo "[4/5] 重启 PM2 进程..."
pm2 restart "$PM2_NAME" 2>/dev/null || pm2 start dist/main.js --name "$PM2_NAME"
echo "[4/5] 后端已重启"

# 5. 前端构建
echo "[5/5] 前端: npm install + build..."
cd "$APP_DIR/client"
npm install 2>&1 | tail -1
npm run build 2>&1 | tail -1
echo "[5/5] 前端构建完成"

echo ""
echo "===== 部署完成! ====="
pm2 status "$PM2_NAME"
