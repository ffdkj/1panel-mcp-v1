#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
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

const config: Config = {
  host: process.env.ONEPANEL_HOST || "localhost",
  port: parseInt(process.env.ONEPANEL_PORT || "8080"),
  apiKey: process.env.ONEPANEL_API_KEY || "",
  protocol: process.env.ONEPANEL_PROTOCOL || "http",
};

if (!config.apiKey) {
  console.error("Error: ONEPANEL_API_KEY required");
  process.exit(1);
}

const client = new OnePanelClient(config);
const server = new Server({ name: "1panel-mcp", version: "1.0.0" }, { capabilities: { tools: {} } });

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
    let result: any;

    // Try each handler until one returns a result
    result = await handleContainerTool(client, name, args);
    if (result !== null) return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };

    result = await handleImageTool(client, name, args);
    if (result !== null) return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };

    result = await handleNetworkTool(client, name, args);
    if (result !== null) return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };

    result = await handleVolumeTool(client, name, args);
    if (result !== null) return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };

    result = await handleComposeTool(client, name, args);
    if (result !== null) return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };

    result = await handleAppTool(client, name, args);
    if (result !== null) return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };

    result = await handleFileTool(client, name, args);
    if (result !== null) return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };

    result = await handleWebsiteTool(client, name, args);
    if (result !== null) return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };

    result = await handleDatabaseTool(client, name, args);
    if (result !== null) return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };

    result = await handleSystemTool(client, name, args);
    if (result !== null) return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };

    result = await handleCronjobTool(client, name, args);
    if (result !== null) return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };

    result = await handleFirewallTool(client, name, args);
    if (result !== null) return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };

    result = await handleBackupTool(client, name, args);
    if (result !== null) return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };

    result = await handleRuntimeTool(client, name, args);
    if (result !== null) return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };

    result = await handleFail2banTool(client, name, args);
    if (result !== null) return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };

    result = await handleDiskTool(client, name, args);
    if (result !== null) return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };

    result = await handleDeviceTool(client, name, args);
    if (result !== null) return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };

    result = await handleFTPTool(client, name, args);
    if (result !== null) return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };

    result = await handleClamTool(client, name, args);
    if (result !== null) return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };

    result = await handlePHPTool(client, name, args);
    if (result !== null) return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };

    result = await handleHostTool(client, name, args);
    if (result !== null) return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };

    result = await handleRecycleBinTool(client, name, args);
    if (result !== null) return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };

    result = await handleSnapshotTool(client, name, args);
    if (result !== null) return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };

    result = await handleTaskTool(client, name, args);
    if (result !== null) return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };

    result = await handleOpenRestyTool(client, name, args);
    if (result !== null) return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };

    result = await handleNodeTool(client, name, args);
    if (result !== null) return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };

    result = await handleOllamaTool(client, name, args);
    if (result !== null) return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };

    throw new Error(`Unknown tool: ${name}`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("1Panel MCP server running on stdio");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
