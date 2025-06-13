#!/bin/bash

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 显示帮助信息
show_help() {
    echo "Gost转发面板 Docker Compose 部署脚本"
    echo ""
    echo "用法: $0 [命令] [选项]"
    echo ""
    echo "命令:"
    echo "  start     启动所有服务"
    echo "  stop      停止所有服务"
    echo "  restart   重启所有服务"
    echo "  build     重新构建前端镜像"
    echo "  logs      查看服务日志"
    echo "  status    查看服务状态"
    echo "  clean     清理未使用的容器和镜像"
    echo ""
    echo "选项:"
    echo "  -h, --help    显示此帮助信息"
    echo ""
    echo "环境变量配置:"
    echo "  DB_NAME           数据库名 (必须设置)"
    echo "  DB_USER           数据库用户 (必须设置)"
    echo "  DB_PASSWORD       数据库密码 (必须设置)"
    echo "  JWT_SECRET        JWT密钥 (必须设置)"
    echo "  SERVER_HOST       服务器地址 (必须设置，格式: ip:port)"
    echo ""
    echo -e "${RED}注意: 所有环境变量都是必需的，不提供默认配置！${NC}"
    echo ""
    echo "示例:"
    echo "  DB_NAME=gost DB_USER=gost DB_PASSWORD=yourpwd JWT_SECRET=yoursecret SERVER_HOST=192.168.1.100:6365 $0 start"
    echo ""

}

# 检测可用的Docker Compose命令
get_docker_compose_cmd() {
    if command -v docker-compose &> /dev/null; then
        echo "docker-compose"
    elif docker compose version &> /dev/null; then
        echo "docker compose"
    else
        echo ""
    fi
}

# 检查docker和docker-compose是否安装
check_dependencies() {
    if ! command -v docker &> /dev/null; then
        echo -e "${RED}错误: Docker 未安装${NC}"
        echo "请先安装Docker: https://docs.docker.com/get-docker/"
        exit 1
    fi
    
    DOCKER_COMPOSE_CMD=$(get_docker_compose_cmd)
    if [ -z "$DOCKER_COMPOSE_CMD" ]; then
        echo -e "${RED}错误: Docker Compose 未安装${NC}"
        echo "请先安装Docker Compose: https://docs.docker.com/compose/install/"
        echo "或者更新Docker到最新版本（包含Compose插件）"
        exit 1
    fi
    
    echo -e "${GREEN}检测到Docker Compose命令: $DOCKER_COMPOSE_CMD${NC}"
}

# 从docker-compose.yml读取端口配置
get_service_port() {
    local service=$1
    local port_line=$(grep -A 10 "^  $service:" docker-compose.yml | grep -E "^\s+ports:" -A 1 | tail -1)
    if [[ $port_line =~ \"([0-9]+):[0-9]+\" ]]; then
        echo "${BASH_REMATCH[1]}"
    elif [[ $port_line =~ ([0-9]+):[0-9]+ ]]; then
        echo $(echo $port_line | cut -d':' -f1 | tr -d ' "')
    fi
}

# 从docker-compose.yml读取数据库配置
get_db_config() {
    local config_key=$1
    local config_value=$(grep -A 20 "environment:" docker-compose.yml | grep "$config_key:" | head -1 | cut -d':' -f2 | cut -d'#' -f1 | xargs)
    echo "$config_value"
}

# 启动服务
start_services() {
    echo -e "${GREEN}启动Gost转发面板服务...${NC}"
    
    # 检查必需的环境变量
    local missing_vars=()
    
    [ -z "$DB_NAME" ] && missing_vars+=("DB_NAME")
    [ -z "$DB_USER" ] && missing_vars+=("DB_USER")
    [ -z "$DB_PASSWORD" ] && missing_vars+=("DB_PASSWORD")
    [ -z "$JWT_SECRET" ] && missing_vars+=("JWT_SECRET")
    [ -z "$SERVER_HOST" ] && missing_vars+=("SERVER_HOST")
    
    if [ ${#missing_vars[@]} -gt 0 ]; then
        echo -e "${RED}错误: 缺少必需的环境变量！${NC}"
        echo -e "${YELLOW}缺少的变量: ${missing_vars[*]}${NC}"
        echo ""
        echo -e "${YELLOW}使用方法:${NC}"
        echo "DB_NAME=gost DB_USER=gost DB_PASSWORD=yourpwd JWT_SECRET=yoursecret SERVER_HOST=your.server.ip:6365 $0 start"
        exit 1
    fi
    
    # 设置环境变量
    export VUE_APP_API_URL="http://${SERVER_HOST}/api/v1"
    export VUE_APP_WS_URL="ws://${SERVER_HOST}"
    
    echo -e "${YELLOW}环境变量配置:${NC}"
    echo "DB_NAME: $DB_NAME"
    echo "DB_USER: $DB_USER"
    echo "DB_PASSWORD: $DB_PASSWORD"
    echo "JWT_SECRET: $JWT_SECRET"
    echo "SERVER_HOST: $SERVER_HOST"
    echo "VUE_APP_API_URL: $VUE_APP_API_URL"
    echo "VUE_APP_WS_URL: $VUE_APP_WS_URL"
    echo ""
    
    # 切换到脚本目录
    cd "$SCRIPT_DIR"
    
    # 生成前端配置文件
    echo -e "${YELLOW}生成前端配置文件...${NC}"
    cat > dist/config.js << EOF
window.APP_CONFIG = {
  VUE_APP_API_URL: "$VUE_APP_API_URL",
  VUE_APP_WS_URL: "$VUE_APP_WS_URL"
}
EOF
    echo -e "${GREEN}配置文件已生成: dist/config.js${NC}"
    
    $DOCKER_COMPOSE_CMD up -d
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}服务启动成功!${NC}"
        echo ""
        
        # 从配置文件读取端口信息
        FRONTEND_PORT=$(get_service_port "frontend")
        BACKEND_PORT=$(get_service_port "backend") 
        MYSQL_PORT=$(get_service_port "mysql")
        REDIS_PORT=$(get_service_port "redis")
        
        # 从配置文件读取数据库配置
        DB_USER=$(get_db_config "MYSQL_USER")
        DB_PASSWORD=$(get_db_config "MYSQL_PASSWORD")
        
        echo -e "${YELLOW}访问地址:${NC}"
        # 提取IP地址（去掉端口）
        SERVER_IP=$(echo "$SERVER_HOST" | cut -d':' -f1)
        echo "  前端界面: http://${SERVER_IP}:${FRONTEND_PORT:-80}"
        echo "  后端API: http://${SERVER_HOST}"
        echo ""
        echo -e "${YELLOW}默认管理员账号:${NC}"
        echo "  用户名: admin_user"
        echo "  密码: admin_user"
        echo ""
        echo -e "${GREEN}部署完成！${NC}"
    else
        echo -e "${RED}服务启动失败!${NC}"
        exit 1
    fi
}

# 停止服务
stop_services() {
    echo -e "${YELLOW}停止所有服务...${NC}"
    cd "$SCRIPT_DIR"
    $DOCKER_COMPOSE_CMD down
    echo -e "${GREEN}服务已停止${NC}"
}

# 重启服务
restart_services() {
    echo -e "${YELLOW}重启所有服务...${NC}"
    cd "$SCRIPT_DIR"
    $DOCKER_COMPOSE_CMD restart
    echo -e "${GREEN}服务重启完成${NC}"
}

# 重新构建前端
build_frontend() {
    echo -e "${YELLOW}重新构建前端镜像...${NC}"
    cd "$SCRIPT_DIR"
    $DOCKER_COMPOSE_CMD build frontend --no-cache
    echo -e "${GREEN}前端镜像构建完成${NC}"
}

# 查看日志
show_logs() {
    cd "$SCRIPT_DIR"
    $DOCKER_COMPOSE_CMD logs -f
}

# 查看状态
show_status() {
    cd "$SCRIPT_DIR"
    $DOCKER_COMPOSE_CMD ps
}

# 清理未使用的容器和镜像
clean_docker() {
    echo -e "${YELLOW}清理未使用的Docker资源...${NC}"
    docker system prune -f
    echo -e "${GREEN}清理完成${NC}"
}

# 完全清理（包括数据卷）
clean_all() {
    echo -e "${RED}警告: 这将删除所有数据，包括数据库！${NC}"
    read -p "确定要继续吗？(y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        cd "$SCRIPT_DIR"
        $DOCKER_COMPOSE_CMD down -v
        docker system prune -f
        echo -e "${GREEN}完全清理完成${NC}"
    else
        echo "操作已取消"
    fi
}

# 主程序
main() {
    check_dependencies
    
    # 设置全局的Docker Compose命令变量
    DOCKER_COMPOSE_CMD=$(get_docker_compose_cmd)
    
    case "${1:-start}" in
        start)
            start_services
            ;;
        stop)
            stop_services
            ;;
        restart)
            restart_services
            ;;
        build)
            build_frontend
            ;;
        logs)
            show_logs
            ;;
        status)
            show_status
            ;;
        clean)
            clean_docker
            ;;
        clean-all)
            clean_all
            ;;
        -h|--help)
            show_help
            ;;
        *)
            echo -e "${RED}未知命令: $1${NC}"
            show_help
            exit 1
            ;;
    esac
}

main "$@" 