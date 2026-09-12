/**
 * MCP Server 工厂
 *
 * 把「工具清单 + 调用分发」从入口文件里抽出来，让 stdio 与 HTTP 两种传输
 * 共用同一套实现：
 *   - stdio 入口：src/index.ts（本地 MCP 客户端，如 Claude Desktop）
 *   - HTTP  入口：src/http.ts （远程 / Tailscale 组网访问）
 *
 * 注意：@modelcontextprotocol/sdk 的 Server 实例同一时刻只能连接一个 transport，
 * 所以 HTTP 模式下每个会话都要调用一次 createMcpServer()。
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { OnePanelClient, Config } from "./client.js";

// Import tool definitions and handlers
import { containerTools, handleContainerTool } from "./tools/container.js";
import { imageTools, handleImageTool } from "./tools/image.js";
import { networkTools, handleNetworkTool } from "./tools/network.js";
import { volumeTools, handleVolumeTool } from "./tools/volume.js";
import { composeTools, handleComposeTool } from "./tools/compose.js";
import { appTools, handleAppTool } from "./tools/app.js";
import { fileTools, handleFileTool } from "./tools/file.js";
import { websiteTools, handleWebsiteTool } from "./tools/website.js";
import { databaseTools, handleDatabaseTool } from "./tools/database.js";
import { systemTools, handleSystemTool } from "./tools/system.js";
import { cronjobTools, handleCronjobTool } from "./tools/cronjob.js";
import { firewallTools, handleFirewallTool } from "./tools/firewall.js";
import { backupTools, handleBackupTool } from "./tools/backup.js";
import { runtimeTools, handleRuntimeTool } from "./tools/runtime.js";
import { fail2banTools, handleFail2banTool } from "./tools/fail2ban.js";
import { diskTools, handleDiskTool } from "./tools/disk.js";
import { deviceTools, handleDeviceTool } from "./tools/device.js";
import { ftpTools, handleFTPTool } from "./tools/ftp.js";
import { clamTools, handleClamTool } from "./tools/clam.js";
import { phpTools, handlePHPTool } from "./tools/php.js";
import { hostTools, handleHostTool } from "./tools/host.js";
import { recycleBinTools, handleRecycleBinTool } from "./tools/recyclebin.js";
import { snapshotTools, handleSnapshotTool } from "./tools/snapshot.js";
import { taskTools, handleTaskTool } from "./tools/task.js";
import { openrestyTools, handleOpenRestyTool } from "./tools/openresty.js";
import { nodeTools, handleNodeTool } from "./tools/node.js";
import { ollamaTools, handleOllamaTool } from "./tools/ollama.js";

const SERVER_NAME = "1panel-mcp";
const SERVER_VERSION = "1.0.0";

const INSTRUCTIONS = `1Panel v1 管理工具集（基于 1Panel v1.10.34-lts 构建与实测，仅使用 /api/v1 接口）。

重要：本服务器只适用于 1Panel **v1**，接口路径与参数与 1Panel v2 不兼容。

工具按域分组：容器与镜像、应用与运行时、文件/备份/快照、系统/主机/监控、安全与运维工具，
以及尽力支持的网站/证书、数据库、定时任务、Ollama、OpenResty。

约定：
- 破坏性操作（删除容器/镜像、停止应用、清理数据、改防火墙）会真实改变面板与宿主机状态，
  执行前请先确认目标对象，不要在未确认的情况下批量调用。
- v1 不支持的接口会返回明确的中文错误，而不是静默失败。
- 业务错误以「HTTP 200 + code != 200」返回，本服务已将其转换为工具错误。`;

/**
 * 读取配置。
 *
 * 兼容策略：ONEPANEL_API_KEY 优先；未设置时回退到 MCP_TOKEN。
 * 这样「用 MCP_TOKEN 作为 ONEPANEL_API_KEY」只需设置一个变量即可。
 */
export function loadConfig(overrides: Partial<Config> = {}): Config {
  const envKey = (process.env.ONEPANEL_API_KEY || "").trim();
  const mcpToken = (process.env.MCP_TOKEN || "").trim();

  const config: Config = {
    host: process.env.ONEPANEL_HOST || "localhost",
    port: parseInt(process.env.ONEPANEL_PORT || "8080", 10),
    apiKey: envKey || mcpToken,
    protocol: process.env.ONEPANEL_PROTOCOL || "http",
  };

  for (const [k, v] of Object.entries(overrides)) {
    if (v !== undefined && v !== null && v !== "") {
      (config as any)[k] = v;
    }
  }
  return config;
}

/** 创建一个已注册全部工具、尚未连接 transport 的 MCP Server 实例。 */
export function createMcpServer(client: OnePanelClient): Server {
  const server = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {} }, instructions: INSTRUCTIONS },
  );

  // Combine all tools
  const tools = [
    ...containerTools,
    ...imageTools,
    ...networkTools,
    ...volumeTools,
    ...composeTools,
    ...appTools,
    ...fileTools,
    ...websiteTools,
    ...databaseTools,
    ...systemTools,
    ...cronjobTools,
    ...firewallTools,
    ...backupTools,
    ...runtimeTools,
    ...fail2banTools,
    ...diskTools,
    ...deviceTools,
    ...ftpTools,
    ...clamTools,
    ...phpTools,
    ...hostTools,
    ...recycleBinTools,
    ...snapshotTools,
    ...taskTools,
    ...openrestyTools,
    ...nodeTools,
    ...ollamaTools,
  ];

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
      const json = (result: any) => ({
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      });

      let result: any;

      // Try each handler until one returns a result
      result = await handleContainerTool(client, name, args);
      if (result !== null) return json(result);

      result = await handleImageTool(client, name, args);
      if (result !== null) return json(result);

      result = await handleNetworkTool(client, name, args);
      if (result !== null) return json(result);

      result = await handleVolumeTool(client, name, args);
      if (result !== null) return json(result);

      result = await handleComposeTool(client, name, args);
      if (result !== null) return json(result);

      result = await handleAppTool(client, name, args);
      if (result !== null) return json(result);

      result = await handleFileTool(client, name, args);
      if (result !== null) return json(result);

      result = await handleWebsiteTool(client, name, args);
      if (result !== null) return json(result);

      result = await handleDatabaseTool(client, name, args);
      if (result !== null) return json(result);

      result = await handleSystemTool(client, name, args);
      if (result !== null) return json(result);

      result = await handleCronjobTool(client, name, args);
      if (result !== null) return json(result);

      result = await handleFirewallTool(client, name, args);
      if (result !== null) return json(result);

      result = await handleBackupTool(client, name, args);
      if (result !== null) return json(result);

      result = await handleRuntimeTool(client, name, args);
      if (result !== null) return json(result);

      result = await handleFail2banTool(client, name, args);
      if (result !== null) return json(result);

      result = await handleDiskTool(client, name, args);
      if (result !== null) return json(result);

      result = await handleDeviceTool(client, name, args);
      if (result !== null) return json(result);

      result = await handleFTPTool(client, name, args);
      if (result !== null) return json(result);

      result = await handleClamTool(client, name, args);
      if (result !== null) return json(result);

      result = await handlePHPTool(client, name, args);
      if (result !== null) return json(result);

      result = await handleHostTool(client, name, args);
      if (result !== null) return json(result);

      result = await handleRecycleBinTool(client, name, args);
      if (result !== null) return json(result);

      result = await handleSnapshotTool(client, name, args);
      if (result !== null) return json(result);

      result = await handleTaskTool(client, name, args);
      if (result !== null) return json(result);

      result = await handleOpenRestyTool(client, name, args);
      if (result !== null) return json(result);

      result = await handleNodeTool(client, name, args);
      if (result !== null) return json(result);

      result = await handleOllamaTool(client, name, args);
      if (result !== null) return json(result);

      throw new Error(`Unknown tool: ${name}`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true };
    }
  });

  return server;
}

export { SERVER_NAME, SERVER_VERSION };
