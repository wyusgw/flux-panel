#!/bin/sh

# 设置默认环境变量
export BACKEND_HOST=${BACKEND_HOST:-backend}
export BACKEND_PORT=${BACKEND_PORT:-6365}
export VUE_APP_API_URL=${VUE_APP_API_URL:-"http://localhost:6365/api/v1"}
export VUE_APP_WS_URL=${VUE_APP_WS_URL:-"ws://localhost:6365"}

echo "=== 容器启动配置 ==="
echo "BACKEND_HOST: $BACKEND_HOST"
echo "BACKEND_PORT: $BACKEND_PORT"
echo "VUE_APP_API_URL: $VUE_APP_API_URL"
echo "VUE_APP_WS_URL: $VUE_APP_WS_URL"
echo "===================="

# 使用envsubst替换nginx配置中的环境变量
envsubst '${BACKEND_HOST} ${BACKEND_PORT}' < /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf

# 使用envsubst替换前端配置文件中的环境变量
envsubst '${VUE_APP_API_URL} ${VUE_APP_WS_URL}' < /usr/share/nginx/html/config.template.js > /usr/share/nginx/html/config.js

echo "配置文件已生成"

# 启动nginx
exec "$@" 