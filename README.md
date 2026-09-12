# 1Panel MCP Server — **V1 版**

[![1Panel](https://img.shields.io/badge/1Panel-v1.10.34--lts-blue)](https://1panel.cn/)
[![API](https://img.shields.io/badge/API-%2Fapi%2Fv1-green)](#)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org/)

> ## ⚠️ 这是 **1Panel V1** 版本
>
> 本项目基于 **`version: v1.10.34-lts`** 构建与实测，只调用 **`/api/v1/*`** 接口。
>
> - ✅ 适用于 **1Panel v1.x**（v1.10.34-lts 实测通过）
> - ❌ **不兼容 1Panel v2** —— v2 使用 `/api/v2/*` 路径，接口路径与字段语义均不同
> - 如果你用的是 v2，请使用上游面向 v2 的 [`EaveLuo/1panel-mcp`](https://github.com/EaveLuo/1panel-mcp)

通过 MCP（Model Context Protocol）让 AI 客户端（Claude Desktop、Cursor、Claude Code 等）直接管理你的 1Panel v1 面板。

---

## 为什么需要这个 V1 版本

上游 `1panel-mcp` 面向 1Panel **v2** 编写，全部 289 处端点硬编码为 `/api/v2/...`。
在 v1.10.34-lts 面板上实测**全部调用失败**（v1 的 `/api/v2` 路由数为 0，请求会落到安全入口守卫页返回 HTML）。

本项目把端点整体移植到 `/api/v1/*`，并逐条核对 v1 的 **请求体字段名、HTTP 方法、参数形态**，而不是简单替换路径前缀。
关键差异例如：

| 能力 | v2 写法 | **v1 实际写法** |
|---|---|---|
| 容器启停 | `POST /containers/operate` `{id, operation}` | `POST /containers/operate` `{names: [], operation}` |
| 删除容器 | `POST /containers/del` | `POST /containers/operate` `{operation: "remove"}` |
| 容器详情 | `POST /containers/info` `{id}` | `POST /containers/info` `{name}` |
| 拉取镜像 | `POST /containers/image/pull` `{name}` | `POST /containers/image/pull` `{imageName}` |
| 容器日志 | `GET /containers/search/log` | `POST /containers/download/log`（UI 那条是 WebSocket 流，裸 GET 必 400） |
| Docker 状态 | `GET /containers/status` | `GET /containers/docker/status` |

同时修复了上游的若干实现缺陷（详见 [修复记录](#修复记录)）。

---

## 特性

- **257 个 MCP 工具**，覆盖 1Panel v1 的主要管理能力
- **端点逐条核对**：239 个 API 调用点与 v1.10.34-lts 的规范逐条比对，**路径 + HTTP 方法 100% 匹配**
- **真实面板实测**：`npm run smoke` 会通过 MCP 协议真实调用只读接口，本项目的开发结论全部来自真机验证
- **正确的鉴权实现**：`1Panel-Token = md5("1panel" + API-Key + UnixTimestamp)`
- **可靠的错误处理**：识别 1Panel「HTTP 200 + body.code」的业务错误、以及安全入口返回的 HTML 守卫页
- **明确的降级**：v1 没有的能力会抛出带说明的错误，而不是发出一个必然失败的请求
- **零多余依赖**：仅依赖 `@modelcontextprotocol/sdk`（CLI 参数解析改为手写，去掉 commander）

## 支持的模块

| 分类 | 模块 |
|---|---|
| **容器与镜像** | 容器、镜像、网络、存储卷、Docker Compose |
| **应用与运行时** | 应用商店、运行环境、PHP、Node.js |
| **文件 / 备份 / 快照** | 文件管理、备份与恢复、回收站、快照 |
| **系统 / 主机 / 监控** | 系统信息、主机管理、设备、磁盘、进程、监控、SSH、日志、设置、任务、面板概览 |
| **安全与运维工具** | 防火墙、Fail2ban、FTP、ClamAV |
| **其他** | 网站与证书、数据库（MySQL/PostgreSQL/Redis）、定时任务、Ollama、OpenResty |

**不支持**（1Panel v1 无对应接口，属 v2 / XPack 专有）：AI Agent、MCP Server、GPU 监控。

### 已知限制

以下几类地方，调用时会返回**明确的中文错误**而不是静默失败。这是有意为之——
v1 缺少对应能力或参数，与其发出一个必然失败的请求，不如直接说清楚：

- **工具入参未跟上 v1 形状**（6 个）：`delete_firewall_rule`、`operate_fail2ban_ssh`、
  `get_clam_records`、`clean_clam_records`、`update_clam_status`、`postgresql_change_privileges`。
  这些工具在 v1 需要额外必填参数（如规则类型、IP 列表、clamID、实例名），
  当前 `inputSchema` 仍是上游 v2 的形状，调用时会提示缺少什么。
  **欢迎 PR 补齐**——改动只在 `src/tools/*.ts`。
- **同类批量能力**：v1 的删除类接口多为批量（`{ids:[...]}`），工具层若只传单个 id 仍可工作，
  但部分场景需要显式传数组。
- **冒烟覆盖率**：`npm run smoke` 覆盖的是「无需参数即可执行」的只读工具（59/257），
  其余需要真实资源 id，不适合自动化调用。

---

## 快速开始

### 1. 安装

```bash
git clone <this-repo>
cd 1panel-mcp-v1
npm install
npm run build
```

### 2. 获取 API 密钥

登录 1Panel → **面板设置 → API 接口** → 启用接口并生成密钥。
**务必把调用方 IP 加入白名单**（白名单不符会返回 `调用 API 接口 IP 不在白名单`）。

### 3. 启动

```bash
export ONEPANEL_HOST=127.0.0.1
export ONEPANEL_PORT=36437        # 你的 1Panel 实际端口
export ONEPANEL_API_KEY=your-api-key

node dist/index.js                # 作为 MCP server 运行（stdio）
```

或用 CLI：

```bash
npx 1panel-mcp-v1 start --host 127.0.0.1 --port 36437 --key your-api-key
```

### 4. HTTP 传输（远程 / 组网访问）

stdio 适合本机客户端拉起；要让**其它设备**（另一台电脑、平板、手机、容器里的 Agent）
用同一个 MCP，需要 HTTP 传输：

```bash
export MCP_TOKEN=your-api-key        # 同时用作面板 API 密钥 + HTTP 访问令牌
export ONEPANEL_HOST=127.0.0.1
export ONEPANEL_PORT=36437

node dist/http.js                    # 默认监听 127.0.0.1:8790
```

只设 `MCP_TOKEN` 即可：未设置 `ONEPANEL_API_KEY` 时，它会自动作为面板 API 密钥使用。

监听地址与端口：

```bash
# 监听 Tailscale 虚拟地址，组网内的设备都能访问
# （tailscale ip -4 会输出本机的 100.x.y.z 地址）
MCP_HOST=$(tailscale ip -4) MCP_PORT=8790 node dist/http.js

# 或用 CLI / 启动脚本
npx 1panel-mcp-v1 serve --bind "$(tailscale ip -4)" --mcp-port 8790
scripts/serve.sh                     # 读取 .env.local
scripts/serve.sh --daemon            # 后台运行（serve.log / serve.pid）
scripts/serve.sh --status | --stop
```

把 `MCP_HOST` 写进 `.env.local` 时填你自己 `tailscale ip -4` 的输出；也可以填 `0.0.0.0`
监听全部网卡（那样局域网也能访问，请自行确认网络环境可信）。

端点：

| 端点 | 方法 | 说明 |
|---|---|---|
| `/mcp` | POST / GET / DELETE | Streamable HTTP（推荐） |
| `/sse` + `/messages` | GET / POST | 旧版 HTTP+SSE 传输（兼容老客户端） |
| `/health` | GET | 存活探测，**无需鉴权**，不泄漏面板信息 |

**安全约定：** 除 `/health` 外所有端点都要求令牌，通过
`Authorization: Bearer <MCP_TOKEN>` 或 `X-MCP-Token: <MCP_TOKEN>` 携带。
`MCP_HOST` 为非回环地址且未设置 `MCP_TOKEN` 时，服务会**拒绝启动** ——
它持有面板管理员密钥，裸奔在网络上等于把面板交出去。
绑定到具体地址（而不是 `0.0.0.0`）可确保只有该网卡可达，例如绑定 Tailscale 地址后
局域网 IP 无法访问。

### 5. 长期常驻（systemd）

`scripts/serve.sh --daemon` 适合手动后台运行；若要开机自启、崩溃自动重拉，
用仓库里的单元模板。模板中的 `__USER__` / `__INSTALL_DIR__` 是占位符，
下面的命令会在安装时替换成本机实际值：

```bash
# 在仓库根目录执行
sed -e "s|__INSTALL_DIR__|$PWD|g" -e "s|__USER__|$(id -un)|g" \
    deploy/1panel-mcp-v1.service \
  | sudo tee /etc/systemd/system/1panel-mcp-v1.service >/dev/null

sudo systemctl daemon-reload
sudo systemctl enable --now 1panel-mcp-v1

systemctl status 1panel-mcp-v1
journalctl -u 1panel-mcp-v1 -f
```

单元文件通过 `EnvironmentFile=` 读取 `<安装目录>/.env.local`，安装前请先按
`.env.example` 建好该文件。

### 环境变量

| 变量 | 说明 | 默认 |
|---|---|---|
| `ONEPANEL_HOST` | 1Panel 地址 | `localhost` |
| `ONEPANEL_PORT` | 1Panel 端口 | `8080` |
| `ONEPANEL_API_KEY` | 面板 API 密钥（未设置时回退到 `MCP_TOKEN`） | — |
| `ONEPANEL_PROTOCOL` | `http` 或 `https` | `http` |
| `MCP_TOKEN` | HTTP 访问令牌；也用作面板密钥回退 | — |
| `MCP_HOST` | HTTP 监听地址（`serve`） | `127.0.0.1` |
| `MCP_PORT` | HTTP 监听端口（`serve`） | `8790` |
| `MCP_PATH` | Streamable HTTP 路径 | `/mcp` |
| `MCP_MAX_BODY` | 请求体上限（字节） | `33554432` |

配置示例见 `.env.example`。

---

## MCP 客户端配置

### Claude Desktop / Claude Code

```json
{
  "mcpServers": {
    "1panel-v1": {
      "command": "node",
      "args": ["/绝对路径/1panel-mcp-v1/dist/index.js"],
      "env": {
        "ONEPANEL_HOST": "127.0.0.1",
        "ONEPANEL_PORT": "36437",
        "ONEPANEL_API_KEY": "your-api-key"
      }
    }
  }
}
```

### Cursor

在 MCP 设置中新增：

```json
{
  "mcpServers": {
    "1panel-v1": {
      "command": "1panel-mcp-v1",
      "args": ["start", "--host", "127.0.0.1", "--port", "36437", "--key", "your-api-key"]
    }
  }
}
```

### 远程 / 组网 HTTP 客户端

支持 Streamable HTTP 的客户端（Claude Code、Cline、以及多数新版 Agent 框架）：

```json
{
  "mcpServers": {
    "1panel-v1": {
      "type": "http",
      "url": "http://100.x.y.z:8790/mcp",
      "headers": { "Authorization": "Bearer your-mcp-token" }
    }
  }
}
```

只支持旧版 SSE 的客户端：

```json
{
  "mcpServers": {
    "1panel-v1": {
      "type": "sse",
      "url": "http://100.x.y.z:8790/sse",
      "headers": { "Authorization": "Bearer your-mcp-token" }
    }
  }
}
```

验证服务是否可达（不需要令牌）：

```bash
curl http://100.x.y.z:8790/health
# {"status":"ok","name":"1panel-mcp","version":"1.0.0","transport":"http"}
```

---

## 鉴权说明

1Panel v1 的外部 API 需要两个请求头，本 server 会自动计算：

```
1Panel-Token     = md5("1panel" + API-Key + UnixTimestamp)   # 秒级时间戳
1Panel-Timestamp = 当前 Unix 时间戳
```

注意几个容易踩的点：

- **Token 不是 API Key 本身**，直接用密钥会返回 `401 API 接口密钥错误`。
- **API 路由不受安全入口影响**：即使面板开了「安全入口」，`/api/v1/*` 也能直接调用，无需 `1pctl user-info` 查入口。
- 若浏览器访问面板需要入口路径，那是 UI 层面的限制，与 API 无关。

---

## 故障排查

| 现象 | 原因 | 处理 |
|---|---|---|
| `401 API 接口密钥错误` | 把 API Key 当成了 Token | 确认用的是 md5 签名（本 server 已自动处理） |
| `调用 API 接口 IP 不在白名单` | 调用方 IP 未加白 | 面板 → API 接口 → 白名单加上该 IP |
| 返回 HTML / `Unexpected token '<'` | 路径在 v1 不存在，落到了安全入口守卫页 | 说明该端点是 v2 专有；本项目已改为抛出明确错误 |
| `API 接口禁止访问` | 该路由未开放给外部 API | 属面板侧限制，无法绕过 |
| 连接被拒 | 面板端口不对 | 用 `1pctl user-info` 或面板设置确认端口 |

---

## 修复记录

相对上游 `1panel-mcp` 修正的问题：

1. **命名冲突导致 HTTP 方法被覆盖**：`ContainerAPI.get(id)` 覆盖了 `BaseAPI.get(path)`，
   导致 `getStatus()` / `getStats()` / `getLogs()` 实际发出 `POST /containers/info`，把 URL 当成容器名。
   改用 `super.get()`。（该缺陷在上游 v2 版本中同样存在）
2. **业务错误被当成成功**：1Panel 用 `HTTP 200 + body.code` 表达错误，原实现只检查 HTTP 状态码。
3. **HTML 守卫页被当作 JSON 解析**，报出难以理解的 `Unexpected token '<'`。
4. **日志端点形态错误**：v1 外部 API 应使用 `POST /containers/download/log`。
5. **生命周期操作字段错误**：v1 是 `{names: [], operation}` 而非 `{id, operation}`。
6. 移除 `commander` 依赖，CLI 参数解析改为手写，减少安装失败面。

---

## 开发

```bash
npm run build      # 编译到 dist/
npm run dev        # 监听模式
npm start          # stdio 模式（dist/index.js）
npm run serve      # HTTP 模式（dist/http.js）
npm run smoke      # 端到端冒烟：真实调用面板的只读接口（stdio）
npm run smoke:http # HTTP 传输测试：鉴权 / 会话 / 真实工具调用
```

`npm run smoke` 需要先配好 `ONEPANEL_*` 环境变量，它只会调用 `list_*` / `get_*` / `search_*`
这类只读工具，不会修改面板状态；输出会区分「通过」「环境所致报错」「v1 主动抛错」三类。

`npm run smoke:http` 需要 `MCP_TOKEN`（以及 `MCP_HOST` / `MCP_PORT`），覆盖 15 项检查：
无令牌/错误令牌/缺 `Bearer` 前缀均返回 401、伪 session id 返回 404、正确令牌下完成
`initialize` → `tools/list`（257 个）→ 真实只读工具调用。

项目结构：

```
src/
├── index.ts        # stdio 入口
├── http.ts         # HTTP 入口（Streamable HTTP + 旧版 SSE + 令牌鉴权）
├── mcp-server.ts   # MCP Server 工厂（工具注册与分发，两种传输共用）
├── client.ts       # OnePanelClient（聚合各 API 模块）
├── cli.ts          # 命令行入口（start / serve / config / tools）
├── api/            # 按模块划分的 API 封装（每个文件对应一类资源）
│   ├── base.ts     # 请求层：鉴权签名、错误处理
│   └── ...
└── tools/          # MCP 工具定义（name / description / inputSchema）
deploy/
└── 1panel-mcp-v1.service  # systemd 单元模板（长期常驻）
docs/
└── v1-api-notes.md # 1Panel v1 API 的实测笔记（移植时踩过的坑都记在这里）
```

新增或修改接口前，**请先读 [`docs/v1-api-notes.md`](docs/v1-api-notes.md)** ——
其中记录了 swagger 注解滞后、路由存在性探测方法、以及一堆 v2 与 v1 的字段/方法差异。

---

## 致谢

本项目移植自 [EaveLuo/1panel-mcp](https://github.com/EaveLuo/1panel-mcp)（MIT）。
原项目的模块划分与工具定义是本项目的基础，在此致谢。

## License

[MIT](LICENSE)
