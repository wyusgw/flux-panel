# 使用nginx作为基础镜像
FROM nginx:alpine

# 安装envsubst工具
RUN apk add --no-cache gettext

# 复制nginx配置模板
COPY nginx.conf.template /etc/nginx/nginx.conf.template

# 复制预打包的dist文件夹
COPY dist /usr/share/nginx/html

# 创建运行时配置脚本
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# 暴露端口
EXPOSE 80

# 使用自定义启动脚本
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"] 