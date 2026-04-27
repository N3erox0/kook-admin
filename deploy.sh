#!/bin/bash
set -e

APP_DIR="/opt/kook-admin"
BAK_ENV="/opt/kook-admin-bak-20260411021332/server/.env"
PM2_NAME="kook-admin-server"
DOMAIN="22bngm.online"

echo "===== KOOK Admin 一键部署 (V2.9.8 HTTPS) ====="

# 1. 拉取代码
cd /opt
if [ -d "$APP_DIR/.git" ]; then
  echo "[1/7] git pull..."
  cd "$APP_DIR" && git pull origin main
else
  for MIRROR in "" "https://mirror.ghproxy.com/" "https://gitclone.com/"; do
    URL="${MIRROR}https://github.com/N3erox0/kook-admin.git"
    echo "[1/7] 尝试拉取: $URL"
    rm -rf kook-admin
    if git clone "$URL" --branch main --depth 1 2>/dev/null; then
      echo "[1/7] 拉取成功!"
      break
    fi
  done
fi

if [ ! -d "$APP_DIR" ]; then
  echo "所有镜像均失败，请检查网络后重试"
  exit 1
fi

# 2. 恢复 .env（仅首次部署或 .env 缺失时）
if [ ! -f "$APP_DIR/server/.env" ]; then
  echo "[2/7] 恢复 .env 配置..."
  if [ -f "$BAK_ENV" ]; then
    cp "$BAK_ENV" "$APP_DIR/server/.env"
    echo "[2/7] .env 已恢复"
  else
    echo "[2/7] 警告: .env 不存在，请手动配置 $APP_DIR/server/.env"
  fi
else
  echo "[2/7] .env 已存在，跳过恢复"
fi

# 3. 后端构建
echo "[3/7] 后端: npm install + build..."
cd "$APP_DIR/server"
npm install --production=false 2>&1 | tail -3
npm run build 2>&1 | tail -3
echo "[3/7] 后端构建完成"

# 4. 重启后端
echo "[4/7] 重启 PM2 进程..."
cd "$APP_DIR/server"
pm2 restart "$PM2_NAME" 2>/dev/null || pm2 start dist/src/main.js --name "$PM2_NAME"
pm2 save
echo "[4/7] 后端已重启"

# 5. 前端构建
echo "[5/7] 前端: npm install + build..."
cd "$APP_DIR/client"
npm install 2>&1 | tail -3
npm run build 2>&1 | tail -3
echo "[5/7] 前端构建完成"

# 6. Nginx + SSL 配置（首次执行，已配置则跳过）
echo "[6/7] 检查 Nginx + SSL..."
if ! command -v nginx &>/dev/null; then
  echo "  安装 Nginx + Certbot..."
  apt update -qq && apt install -y -qq nginx certbot python3-certbot-nginx
fi

NGINX_CONF="/etc/nginx/sites-available/kook-admin"
if [ ! -f "$NGINX_CONF" ]; then
  echo "  配置 Nginx..."
  cp "$APP_DIR/nginx/kook-admin.conf" "$NGINX_CONF"
  ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/kook-admin
  rm -f /etc/nginx/sites-enabled/default
  nginx -t && systemctl reload nginx
  echo "  申请 SSL 证书..."
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email || echo "  SSL 证书申请失败，请手动执行: certbot --nginx -d $DOMAIN"
else
  echo "  Nginx 配置已存在，reload..."
  nginx -t && systemctl reload nginx
fi
echo "[6/7] Nginx + SSL 完成"

# 7. 验证
echo "[7/7] 验证..."
sleep 2
curl -sf http://127.0.0.1:3000/api/auth/login -X POST -o /dev/null && echo "  后端 OK" || echo "  后端检测失败，请查看 pm2 logs"
echo ""
echo "===== 部署完成! ====="
echo "HTTPS: https://$DOMAIN"
pm2 status "$PM2_NAME"
