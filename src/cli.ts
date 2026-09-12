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
  1panel-mcp-v1 start [选项]      启动 MCP server（stdio 传输）
  1panel-mcp-v1 config            显示配置说明
  1panel-mcp-v1 tools             列出工具分类
  1panel-mcp-v1 --version         显示版本

start 选项:
  -h, --host <host>   1Panel 地址   (默认 localhost，也可用 ONEPANEL_HOST)
  -p, --port <port>   1Panel 端口   (默认 8080，也可用 ONEPANEL_PORT)
  -k, --key <key>     API 密钥      (必填，也可用 ONEPANEL_API_KEY)
  -s, --secure        使用 HTTPS    (也可用 ONEPANEL_PROTOCOL=https)

示例:
  export ONEPANEL_API_KEY=your-api-key
  1panel-mcp-v1 start --host 127.0.0.1 --port 36437

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
  ONEPANEL_API_KEY  1Panel API 密钥 (必填)
  ONEPANEL_PROTOCOL http 或 https   (默认 http)

鉴权说明（1Panel v1）:
  请求头 1Panel-Token     = md5("1panel" + API-Key + UnixTimestamp)
  请求头 1Panel-Timestamp = 当前 Unix 秒级时间戳
  本 server 会自动计算这两个头，无需手动处理。

MCP 客户端配置示例（Claude Desktop / Cursor）:
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

async function main() {
  const { command, opts } = parseArgs(process.argv);

  if (opts.version) {
    console.log(VERSION);
    return;
  }

  switch (command) {
    case "start": {
      const host = (opts.host as string) || process.env.ONEPANEL_HOST || "localhost";
      const port = (opts.port as string) || process.env.ONEPANEL_PORT || DEFAULT_PORT;
      const key = (opts.key as string) || process.env.ONEPANEL_API_KEY;
      const protocol = opts.secure ? "https" : process.env.ONEPANEL_PROTOCOL || "http";

      if (!key) {
        console.error("错误: 缺少 API 密钥");
        console.error("请用 --key 参数或设置 ONEPANEL_API_KEY 环境变量");
        process.exit(1);
      }

      // 通过环境变量把配置传给 stdio server 主进程
      const env = { ...process.env, ONEPANEL_HOST: host, ONEPANEL_PORT: port, ONEPANEL_API_KEY: key, ONEPANEL_PROTOCOL: protocol };
      const child = spawn("node", [join(__dirname, "index.js")], { stdio: "inherit", env });
      child.on("exit", (code) => process.exit(code || 0));
      break;
    }
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
