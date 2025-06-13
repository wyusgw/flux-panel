#!/bin/sh

# 设置默认环境变量
export BACKEND_HOST=${BACKEND_HOST:-backend}
export BACKEND_PORT=${BACKEND_PORT:-6365}

echo "=== 容器启动配置 ==="
echo "BACKEND_HOST: $BACKEND_HOST"
echo "BACKEND_PORT: $BACKEND_PORT"
echo "===================="

# 使用envsubst替换nginx配置中的环境变量
envsubst '${BACKEND_HOST} ${BACKEND_PORT}' < /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf

echo "Nginx配置文件已生成"

# 启动nginx
exec "$@" 