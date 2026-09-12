export { BaseAPI } from "./base.js";
export { ContainerAPI } from "./containers.js";
export { ImageAPI } from "./images.js";
export { NetworkAPI } from "./networks.js";
export { VolumeAPI } from "./volumes.js";
export { ComposeAPI } from "./composes.js";
export { AppAPI } from "./apps.js";
export { WebsiteAPI } from "./websites.js";
export { FileAPI } from "./files.js";
export { DatabaseAPI } from "./databases.js";
export { SystemAPI } from "./system.js";
export { CronjobAPI } from "./cronjobs.js";
export { FirewallAPI } from "./firewall.js";
export { ProcessAPI } from "./process.js";
export { SSHAPI } from "./ssh.js";
export { TerminalAPI } from "./terminal.js";
export { BackupAPI } from "./backup.js";
export { BackupAccountAPI } from "./backupaccount.js";
export { SettingsAPI } from "./settings.js";
export { LogsAPI } from "./logs.js";
export { RuntimeAPI } from "./runtime.js";
export { Fail2BanAPI } from "./fail2ban.js";
export { DiskAPI } from "./disk.js";
export { DashboardAPI } from "./dashboard.js";
export { MonitorAPI } from "./monitor.js";
export { DeviceAPI } from "./device.js";
export { FTPAPI } from "./ftp.js";
export { ClamAPI } from "./clam.js";
export { PHPAPI } from "./php.js";
export { HostAPI } from "./host.js";
export { RecycleBinAPI } from "./recyclebin.js";
export { SnapshotAPI } from "./snapshot.js";
export { TaskAPI } from "./task.js";
export { OpenRestyAPI } from "./openresty.js";
export { NodeAPI } from "./node.js";
export { OllamaAPI } from "./ollama.js";

// 说明：1Panel v1.10.34-lts 没有 AI Agent / MCP Server / GPU 监控相关端点
// （swagger 中不存在 /ai/agents/*、/ai/mcp/*，仅 /ai/ollama/* 与 /ai/gpu/load），
// 故 GPUAPI 与 AIAPI 已在本次 v1 移植中移除。
