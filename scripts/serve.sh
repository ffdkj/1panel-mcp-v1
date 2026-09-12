#!/usr/bin/env bash
#
# 启动 1panel-mcp-v1 的 HTTP 传输（供远程 / Tailscale 组网内的 MCP 客户端访问）
#
# 用法:
#   scripts/serve.sh                 前台运行
#   scripts/serve.sh --daemon        后台运行（日志写入 serve.log，PID 写入 serve.pid）
#   scripts/serve.sh --status        查看运行状态
#   scripts/serve.sh --stop          停止后台实例
#
# 配置从 .env.local 读取（已在 .gitignore 中排除，不会提交），可用环境变量覆盖。
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

LOG="$DIR/serve.log"
PIDFILE="$DIR/serve.pid"

# 载入本地配置
if [[ -f "$DIR/.env.local" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$DIR/.env.local"
  set +a
fi

# 未设置 ONEPANEL_API_KEY 时，server 会自动把 MCP_TOKEN 当作面板密钥使用
: "${MCP_HOST:=127.0.0.1}"
: "${MCP_PORT:=8790}"
: "${ONEPANEL_HOST:=127.0.0.1}"
: "${ONEPANEL_PORT:=36437}"
export MCP_HOST MCP_PORT ONEPANEL_HOST ONEPANEL_PORT

if [[ -z "${MCP_TOKEN:-}" && -z "${ONEPANEL_API_KEY:-}" ]]; then
  echo "错误: 请设置 MCP_TOKEN（推荐）或 ONEPANEL_API_KEY —— 见 .env.example" >&2
  exit 1
fi

alive() { [[ -f "$PIDFILE" ]] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; }

case "${1:-}" in
  --stop)
    if alive; then
      kill "$(cat "$PIDFILE")"
      rm -f "$PIDFILE"
      echo "已停止 (PID $(cat "$PIDFILE" 2>/dev/null || echo '?'))"
    else
      echo "没有正在运行的后台实例"
      [[ -f "$PIDFILE" ]] && rm -f "$PIDFILE"
    fi
    exit 0
    ;;
  --status)
    if alive; then
      pid="$(cat "$PIDFILE")"
      echo "运行中  PID=$pid  端点 http://$MCP_HOST:$MCP_PORT/mcp"
      ss -tlnp 2>/dev/null | grep ":$MCP_PORT " || true
    else
      echo "未运行"
      exit 1
    fi
    exit 0
    ;;
esac

if [[ ! -f "$DIR/dist/http.js" ]]; then
  echo "未找到 dist/http.js，正在构建…" >&2
  npm run build
fi

if [[ "${1:-}" == "--daemon" ]]; then
  if alive; then
    echo "已在运行 (PID $(cat "$PIDFILE"))，如需重启请先 --stop" >&2
    exit 1
  fi
  # setsid 脱离当前会话：终端退出 / SSH 断开后依然存活
  setsid nohup node "$DIR/dist/http.js" >>"$LOG" 2>&1 &
  echo $! >"$PIDFILE"
  sleep 1.5
  if alive; then
    echo "已启动 (PID $(cat "$PIDFILE"))"
    echo "端点 http://$MCP_HOST:$MCP_PORT/mcp"
    echo "日志 $LOG"
  else
    echo "启动失败，日志末尾:" >&2
    tail -20 "$LOG" >&2
    rm -f "$PIDFILE"
    exit 1
  fi
  exit 0
fi

exec node "$DIR/dist/http.js"
