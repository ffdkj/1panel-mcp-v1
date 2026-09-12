#!/usr/bin/env bash
#
# 安装 / 卸载 1panel-mcp-v1 的 systemd 服务
#
# 用法:
#   sudo deploy/install-systemd.sh              安装并启动（开机自启）
#   sudo deploy/install-systemd.sh --uninstall  停止并移除
#   sudo deploy/install-systemd.sh --dry-run    只生成单元文件并校验语法，不碰系统（无需 root）
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UNIT_NAME="1panel-mcp-v1"
UNIT_SRC="$DIR/deploy/$UNIT_NAME.service"
UNIT_DST="/etc/systemd/system/$UNIT_NAME.service"
NODE_BIN="${NODE_BIN:-/usr/bin/node}"

die() { echo "错误: $*" >&2; exit 1; }
info() { echo "  $*"; }

render_unit() {
  local out="$1"
  local runas="${SUDO_USER:-$(stat -c '%U' "$DIR")}"
  if [[ "$runas" == "root" && -z "${SUDO_USER:-}" ]]; then
    echo "警告: 无法确定运行用户，将使用 root（建议用 sudo 执行本脚本）" >&2
  fi
  sed -e "s|__INSTALL_DIR__|$DIR|g" \
      -e "s|__USER__|$runas|g" \
      -e "s|/usr/bin/node|$NODE_BIN|g" \
      "$UNIT_SRC" > "$out"
}

# 从 .env.local 取端口。不 source：避免以 root 身份执行用户文件里的任意内容
mcp_port() {
  local p
  p="$(sed -n 's/^MCP_PORT=//p' "$DIR/.env.local" 2>/dev/null | tail -1 | tr -d '"'"'"'[:space:]')"
  echo "${p:-8790}"
}

port_pid() { ss -tlnpH "sport = :$1" 2>/dev/null | grep -oP 'pid=\K[0-9]+' | head -1; }

preflight() {
  [[ -f "$DIR/.env.local" ]] || die "缺少 $DIR/.env.local —— 请先照 .env.example 创建并填入 MCP_TOKEN"
  if [[ ! -f "$DIR/dist/http.js" ]]; then
    info "未找到 dist/http.js，正在构建…"
    (cd "$DIR" && npm run build) || die "构建失败"
  fi
  [[ -x "$NODE_BIN" ]] || die "找不到 node: $NODE_BIN（可用 NODE_BIN=... 覆盖）"
  [[ -r "$DIR/.env.local" ]] || die "$DIR/.env.local 不可读，请检查权限/属主"
  grep -q '^MCP_TOKEN=\|^ONEPANEL_API_KEY=' "$DIR/.env.local" \
    || die "$DIR/.env.local 里既没有 MCP_TOKEN 也没有 ONEPANEL_API_KEY"
}

# 释放端口：只清理本目录手工启动的实例；其它占用者交给用户决定
release_port() {
  local port="$1" pid
  pid="$(port_pid "$port")"
  if [[ -z "$pid" ]]; then info "端口 $port 空闲"; return; fi

  if [[ -f "$DIR/serve.pid" ]] && [[ "$(cat "$DIR/serve.pid")" == "$pid" ]]; then
    info "停止手工实例（serve.pid）PID $pid"
    kill "$pid" 2>/dev/null || true
    sleep 1
    return
  fi

  if tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null | grep -q "$DIR/dist/http.js"; then
    info "停止本目录手工启动的实例 PID $pid"
    kill "$pid" 2>/dev/null || true
    sleep 1
    return
  fi

  local cmd
  cmd="$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null | cut -c1-80)"
  die "端口 $port 被其它进程占用（PID $pid: $cmd），请先处理后再安装"
}

case "${1:-}" in
  --uninstall)
    [[ $EUID -eq 0 ]] || die "需要 root，请用 sudo 运行"
    systemctl disable --now "$UNIT_NAME" 2>/dev/null || true
    rm -f "$UNIT_DST"
    systemctl daemon-reload
    systemctl reset-failed "$UNIT_NAME" 2>/dev/null || true
    echo "已卸载 $UNIT_NAME"
    exit 0
    ;;
  --dry-run)
    TMP="$(mktemp -d)"
    trap 'rm -rf "$TMP"' EXIT
    render_unit "$TMP/$UNIT_NAME.service"
    echo "── 生成的单元文件 ──"
    grep -E '^(User|Group|WorkingDirectory|EnvironmentFile|ExecStart|Restart|MemoryMax|CPUQuota)=' "$TMP/$UNIT_NAME.service"
    echo "  监听端口 $(mcp_port)"
    echo
    echo "── systemd-analyze verify ──"
    systemd-analyze verify "$TMP/$UNIT_NAME.service" && echo "✅ 语法与依赖校验通过"
    exit 0
    ;;
esac

[[ $EUID -eq 0 ]] || die "需要 root，请用 sudo 运行: sudo $0"

echo "1/5 前置检查"
preflight
info "安装目录 $DIR"
info "运行用户 $(render_unit /dev/stdout | sed -n 's/^User=//p')"
info "node     $NODE_BIN"

echo "2/5 生成单元文件 → $UNIT_DST"
render_unit "$UNIT_DST"
chmod 644 "$UNIT_DST"

echo "3/5 校验单元文件"
systemd-analyze verify "$UNIT_DST" || die "单元文件校验未通过，已保留 $UNIT_DST 供排查"
info "校验通过"

echo "4/5 释放端口 $(mcp_port)"
release_port "$(mcp_port)"

echo "5/5 启用并启动"
systemctl daemon-reload
if ! systemctl enable --now "$UNIT_NAME"; then
  echo "启动失败，最近日志：" >&2
  journalctl -u "$UNIT_NAME" -n 30 --no-pager >&2 || true
  exit 1
fi

sleep 2
systemctl --no-pager --full status "$UNIT_NAME" || true
echo
echo "完成。常用命令："
echo "  systemctl status $UNIT_NAME"
echo "  journalctl -u $UNIT_NAME -f"
echo "  sudo systemctl restart $UNIT_NAME"
echo "  sudo $DIR/deploy/install-systemd.sh --uninstall"
