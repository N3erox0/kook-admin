#!/bin/bash
cd /opt/kook-admin/server

# 登录获取 token
RESP=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"22bnNice"}')

TOKEN=$(echo "$RESP" | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d.get("data",{}).get("accessToken",d.get("accessToken","")))')

if [ -z "$TOKEN" ]; then
  echo "LOGIN FAILED: $RESP"
  exit 1
fi

echo "TOKEN obtained, calling generate-phash..."

# 调用 generate-phash
curl -s -X POST http://localhost:3000/api/catalog/generate-phash \
  -H 'Content-Type: application/json' \
  -H 'X-Guild-Id: 1' \
  -H "Authorization: Bearer $TOKEN"

echo ""
echo "DONE"
