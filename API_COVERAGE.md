# API 覆盖情况（1Panel v1）

本表由源码与 **1Panel v1.10.34-lts** 的 API 规范逐条比对生成。

- **MCP 工具总数**：257
- **API 端点调用点**：240
- 路径 + HTTP 方法均匹配：**240**
- 方法不符：0
- v1 不存在的路径：0
- 显式标注「v1 不支持」并抛错的能力：34

## 按模块

| 模块 | 调用点 | ✅ 匹配 | ⚠️ 方法不符 | ❌ v1 无此路径 | 标注不支持 |
|---|---|---|---|---|---|
| `apps` | 6 | 6 |  |  |  |
| `backup` | 3 | 3 |  |  |  |
| `backupaccount` | 8 | 8 |  |  |  |
| `clam` | 11 | 11 |  |  |  |
| `composes` | 4 | 4 |  |  | 1 |
| `containers` | 16 | 16 |  |  |  |
| `cronjobs` | 3 | 3 |  |  |  |
| `dashboard` | 4 | 4 |  |  | 2 |
| `databases` | 28 | 28 |  |  | 5 |
| `device` | 8 | 8 |  |  |  |
| `disk` | 1 | 1 |  |  | 3 |
| `fail2ban` | 5 | 5 |  |  |  |
| `files` | 19 | 19 |  |  |  |
| `firewall` | 6 | 6 |  |  | 1 |
| `ftp` | 7 | 7 |  |  |  |
| `host` | 18 | 18 |  |  | 2 |
| `images` | 11 | 11 |  |  |  |
| `logs` | 7 | 7 |  |  |  |
| `monitor` | 4 | 4 |  |  | 1 |
| `networks` | 3 | 3 |  |  |  |
| `node` | 4 | 4 |  |  |  |
| `ollama` | 7 | 7 |  |  |  |
| `openresty` | 5 | 5 |  |  | 6 |
| `php` | 2 | 2 |  |  | 7 |
| `process` | 1 | 1 |  |  | 1 |
| `recyclebin` | 4 | 4 |  |  |  |
| `runtime` | 3 | 3 |  |  |  |
| `settings` | 2 | 2 |  |  |  |
| `snapshot` | 8 | 8 |  |  |  |
| `ssh` | 3 | 3 |  |  |  |
| `system` | 3 | 3 |  |  |  |
| `task` | 0 | 0 |  |  | 2 |
| `terminal` | 0 | 0 |  |  | 1 |
| `volumes` | 3 | 3 |  |  |  |
| `websites` | 23 | 23 |  |  | 2 |

> 「❌ v1 无此路径」为 0 表示该模块所有调用点都与 v1 规范一致；
> 非 0 时，对应方法已改为抛出明确错误（不会静默发出无效请求）。

## 已验证的部分

以下模块的只读接口已在真实 1Panel v1.10.34-lts 面板上跑通（见 `npm run smoke`）：

- 容器 / 镜像 / 网络 / 存储卷 / Compose
- 应用商店、运行环境
- 文件、回收站、快照、备份
- 主机、系统、设备、磁盘、进程、监控、SSH、日志、设置、任务、面板概览
- 防火墙、Fail2ban、FTP、ClamAV
- 网站、数据库、定时任务、Ollama、OpenResty

## 未纳入的能力

1Panel v1.10.34-lts 不存在以下端点，相关工具已移除：

- **AI Agent** 管理（`/ai/agents/*`）—— v2 / XPack 专有
- **MCP Server** 管理（`/ai/mcp/*`）—— v2 / XPack 专有
- **GPU 监控**（`/hosts/monitor/gpu/*`）—— v1 仅有 `/ai/gpu/load`（Ollama 用）
