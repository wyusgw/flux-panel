#!/bin/bash

# 离线部署脚本：与 install.sh 的安装逻辑基本一致，区别在于不联网下载 gost 二进制，
# 而是直接使用与本脚本一起解压出来的本地 ./gost 文件（来自离线包 zip）。
# 用法：bash offline.sh -a <服务器地址> -s <密钥>

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="/etc/gost"

while getopts "a:s:" opt; do
  case $opt in
    a) SERVER_ADDR="$OPTARG" ;;
    s) SECRET="$OPTARG" ;;
    *) echo "无效参数"; exit 1 ;;
  esac
done

if [[ -z "$SERVER_ADDR" || -z "$SECRET" ]]; then
  echo "请输入配置参数："
  [[ -z "$SERVER_ADDR" ]] && read -p "服务器地址: " SERVER_ADDR
  [[ -z "$SECRET" ]] && read -p "密钥: " SECRET
  if [[ -z "$SERVER_ADDR" || -z "$SECRET" ]]; then
    echo "参数不完整，操作取消。"
    exit 1
  fi
fi

if [[ ! -f "$SCRIPT_DIR/gost" ]]; then
  echo "未找到本地 gost 文件，请确认 offline.sh 与 gost 二进制解压在同一目录下。"
  exit 1
fi

echo "开始离线部署 GOST..."

mkdir -p "$INSTALL_DIR"

# 停止并禁用已有服务
if systemctl list-units --full -all 2>/dev/null | grep -Fq "gost.service"; then
  echo "检测到已存在的gost服务"
  systemctl stop gost 2>/dev/null && echo "停止服务"
  systemctl disable gost 2>/dev/null && echo "禁用自启"
fi

# 删除旧文件，使用本地已解压的二进制
[[ -f "$INSTALL_DIR/gost" ]] && echo "删除旧文件 gost" && rm -f "$INSTALL_DIR/gost"
cp "$SCRIPT_DIR/gost" "$INSTALL_DIR/gost"
chmod +x "$INSTALL_DIR/gost"
echo "已安装本地 gost 二进制"

# 打印版本
echo "gost 版本：$($INSTALL_DIR/gost -V)"

# 写入 config.json（离线部署时总是创建新的）
CONFIG_FILE="$INSTALL_DIR/config.json"
echo "创建新配置: config.json"
cat > "$CONFIG_FILE" <<EOF
{
  "addr": "$SERVER_ADDR",
  "secret": "$SECRET"
}
EOF

# 写入 gost.json
GOST_CONFIG="$INSTALL_DIR/gost.json"
if [[ -f "$GOST_CONFIG" ]]; then
  echo "跳过配置文件: gost.json (已存在)"
else
  echo "创建新配置: gost.json"
  cat > "$GOST_CONFIG" <<EOF
{}
EOF
fi

# 加强权限
chmod 600 "$INSTALL_DIR"/*.json

# 创建 systemd 服务
SERVICE_FILE="/etc/systemd/system/gost.service"
cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=Gost Proxy Service
After=network.target

[Service]
WorkingDirectory=$INSTALL_DIR
ExecStart=$INSTALL_DIR/gost
Restart=on-failure

[Install]
WantedBy=multi-user.target
EOF

# 启动服务
systemctl daemon-reload
systemctl enable gost
systemctl start gost

# 检查状态
echo "检查服务状态..."
if systemctl is-active --quiet gost; then
  echo "离线部署完成，gost服务已启动并设置为开机启动。"
  echo "配置目录: $INSTALL_DIR"
  echo "服务状态: $(systemctl is-active gost)"
else
  echo "gost服务启动失败，请执行以下命令查看日志："
  echo "journalctl -u gost -f"
fi
