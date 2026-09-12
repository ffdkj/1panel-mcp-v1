#!/usr/bin/env node
/**
 * 命令行入口（零依赖）
 *
 * 原版依赖 commander，本移植版改为手写参数解析：既少一个运行时依赖，
 * 也让 `npm install` 在离线/受限环境下更容易成功。
 */
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const VERSION = "1.0.0";
const DEFAULT_PORT = "36437"; // 1Panel 默认端口区间，仅作提示

function parseArgs(argv: string[]) {
  const args = argv.slice(2);
  const command = args[0] && !args[0].startsWith("-") ? args[0] : "help";
  const opts: Record<string, string | boolean> = {};
  for (let i = args[0] && !args[0].startsWith("-") ? 1 : 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--host" || a === "-h") opts.host = args[++i];
    else if (a === "--port" || a === "-p") opts.port = args[++i];
    else if (a === "--key" || a === "-k") opts.key = args[++i];
    else if (a === "--secure" || a === "-s") opts.secure = true;
    else if (a === "--bind" || a === "-b") opts.bind = args[++i];
    else if (a === "--mcp-port") opts.mcpPort = args[++i];
    else if (a === "--token" || a === "-t") opts.token = args[++i];
    else if (a === "--help" || a === "-?") opts.help = true;
    else if (a === "--version" || a === "-v") opts.version = true;
    // 忽略无法识别的参数，避免因为多一个空格就崩掉
  }
  return { command, opts };
}

function printHelp() {
  console.log(`
1panel-mcp-v1 — 1Panel v1 版 MCP Server

用法:
  1panel-mcp-v1 start [选项]      启动 MCP server（stdio 传输，供本地客户端拉起）
  1panel-mcp-v1 serve [选项]      启动 MCP server（HTTP 传输，供远程/组网访问）
  1panel-mcp-v1 config            显示配置说明
  1panel-mcp-v1 tools             列出工具分类
  1panel-mcp-v1 --version         显示版本

start 选项:
  -h, --host <host>   1Panel 地址   (默认 localhost，也可用 ONEPANEL_HOST)
  -p, --port <port>   1Panel 端口   (默认 8080，也可用 ONEPANEL_PORT)
  -k, --key <key>     API 密钥      (必填，也可用 ONEPANEL_API_KEY，或回退 MCP_TOKEN)
  -s, --secure        使用 HTTPS    (也可用 ONEPANEL_PROTOCOL=https)

serve 选项:
  -b, --bind <addr>   监听地址      (默认 127.0.0.1，也可用 MCP_HOST)
      --mcp-port <n>  监听端口      (默认 8790，也可用 MCP_PORT)
  -t, --token <tok>   访问令牌      (监听非回环地址时必填，也可用 MCP_TOKEN)
  其余选项同 start

示例:
  export ONEPANEL_API_KEY=your-api-key
  1panel-mcp-v1 start --host 127.0.0.1 --port 36437

  # 监听 Tailscale 虚拟地址，供组网内其它设备访问
  export MCP_TOKEN=your-api-key          # 同时用作面板 API 密钥
  export ONEPANEL_HOST=127.0.0.1 ONEPANEL_PORT=36437
  1panel-mcp-v1 serve --bind 100.109.194.40 --mcp-port 8790

获取 API 密钥:
  登录 1Panel → 面板设置 → API 接口 → 启用并生成密钥
  注意把调用方 IP 加入白名单。
`);
}

function printConfig() {
  console.log(`
1Panel MCP 配置
===============

环境变量:
  ONEPANEL_HOST     1Panel 地址    (默认 localhost)
  ONEPANEL_PORT     1Panel 端口    (默认 8080)
  ONEPANEL_API_KEY  1Panel API 密钥 (未设置时回退到 MCP_TOKEN)
  ONEPANEL_PROTOCOL http 或 https   (默认 http)

  MCP_TOKEN         同时用作面板 API 密钥 + HTTP 访问令牌（一个变量搞定）
  MCP_HOST          HTTP 监听地址  (默认 127.0.0.1，serve 命令)
  MCP_PORT          HTTP 监听端口  (默认 8790，serve 命令)
  MCP_PATH          MCP 路径       (默认 /mcp)
  MCP_MAX_BODY      请求体上限字节 (默认 33554432)

鉴权说明（1Panel v1）:
  请求头 1Panel-Token     = md5("1panel" + API-Key + UnixTimestamp)
  请求头 1Panel-Timestamp = 当前 Unix 秒级时间戳
  本 server 会自动计算这两个头，无需手动处理。

HTTP 模式的端点:
  POST /mcp          Streamable HTTP（推荐）
  GET  /mcp          SSE 通知流
  DELETE /mcp        结束会话
  GET  /sse          旧版 SSE 传输
  POST /messages     旧版 SSE 上行通道
  GET  /health       存活探测（无需鉴权）

  请求需携带  Authorization: Bearer <MCP_TOKEN>  或  X-MCP-Token: <MCP_TOKEN>

MCP 客户端配置示例（Claude Desktop / Cursor，stdio）:
{
  "mcpServers": {
    "1panel": {
      "command": "1panel-mcp-v1",
      "args": ["start"],
      "env": {
        "ONEPANEL_HOST": "127.0.0.1",
        "ONEPANEL_PORT": "36437",
        "ONEPANEL_API_KEY": "your-api-key"
      }
    }
  }
}

MCP 客户端配置示例（远程 HTTP，支持 Streamable HTTP 的客户端）:
{
  "mcpServers": {
    "1panel": {
      "type": "http",
      "url": "http://100.109.194.40:8790/mcp",
      "headers": { "Authorization": "Bearer your-mcp-token" }
    }
  }
}
`);
}

function printTools() {
  console.log(`
工具分类（针对 1Panel v1.10.34-lts）
====================================

容器与镜像:
  - 容器管理、镜像管理、网络、存储卷、Docker Compose

应用与运行时:
  - 应用商店、运行环境、PHP、Node.js

文件 / 备份 / 快照:
  - 文件管理、备份与恢复、回收站、快照

系统 / 主机 / 监控:
  - 系统信息、主机管理、设备、磁盘、进程、监控、SSH、日志、设置、任务、面板概览

安全与运维工具:
  - 防火墙、Fail2ban、FTP、ClamAV

其他（尽力支持）:
  - 网站与证书、数据库、定时任务、Ollama、OpenResty

未包含（1Panel v1 无对应接口）:
  - AI Agent、MCP Server、GPU 监控（属 v2 / XPack 专有能力）

运行 "1panel-mcp-v1 start" 后由 MCP 客户端通过 tools/list 获取完整清单。
`);
}

/** 把命令行选项 + 环境变量合成子进程环境。密钥回退顺序：--key > ONEPANEL_API_KEY > MCP_TOKEN */
function buildEnv(opts: Record<string, string | boolean>): NodeJS.ProcessEnv {
  const host = (opts.host as string) || process.env.ONEPANEL_HOST || "localhost";
  const port = (opts.port as string) || process.env.ONEPANEL_PORT || DEFAULT_PORT;
  const key = (opts.key as string) || process.env.ONEPANEL_API_KEY || process.env.MCP_TOKEN;
  const protocol = opts.secure ? "https" : process.env.ONEPANEL_PROTOCOL || "http";

  if (!key) {
    console.error("错误: 缺少 API 密钥");
    console.error("请用 --key 参数，或设置 ONEPANEL_API_KEY / MCP_TOKEN 环境变量");
    process.exit(1);
  }

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ONEPANEL_HOST: host,
    ONEPANEL_PORT: port,
    ONEPANEL_API_KEY: key,
    ONEPANEL_PROTOCOL: protocol,
  };

  if (opts.bind) env.MCP_HOST = opts.bind as string;
  if (opts.mcpPort) env.MCP_PORT = opts.mcpPort as string;
  if (opts.token) env.MCP_TOKEN = opts.token as string;

  return env;
}

/** 拉起子进程并转发退出码。 */
function runEntry(entry: string, env: NodeJS.ProcessEnv): void {
  const child = spawn("node", [join(__dirname, entry)], { stdio: "inherit", env });
  child.on("exit", (code) => process.exit(code || 0));
}

async function main() {
  const { command, opts } = parseArgs(process.argv);

  if (opts.version) {
    console.log(VERSION);
    return;
  }

  switch (command) {
    case "start":
      runEntry("index.js", buildEnv(opts));
      break;
    case "serve":
      runEntry("http.js", buildEnv(opts));
      break;
    case "config":
      printConfig();
      break;
    case "tools":
      printTools();
      break;
    default:
      printHelp();
  }
}

main().catch((err) => {
  console.error("CLI 错误:", err);
  process.exit(1);
});
