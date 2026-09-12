#!/usr/bin/env node
/**
 * stdio 入口 —— 供本地 MCP 客户端（Claude Desktop / Cursor / Cline 等）以子进程方式启动。
 *
 * 需要远程 / 组网访问请使用 HTTP 入口：
 *   node dist/http.js            （或 1panel-mcp-v1 serve）
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { OnePanelClient } from "./client.js";
import { createMcpServer, loadConfig } from "./mcp-server.js";

async function main() {
  const config = loadConfig();

  if (!config.apiKey) {
    console.error("Error: ONEPANEL_API_KEY required （也可用 MCP_TOKEN 提供）");
    process.exit(1);
  }

  const client = new OnePanelClient(config);
  const server = createMcpServer(client);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("1Panel MCP server running on stdio");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
