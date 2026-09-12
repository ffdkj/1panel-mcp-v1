# 1Panel v1 API 笔记

本文件记录把本项目从 1Panel v2 移植到 **v1.10.34-lts** 过程中确认的事实，供后续维护参考。
每一条都经过真实面板验证，不是推测。

---

## 1. 鉴权

```http
1Panel-Token:     md5("1panel" + API-Key + UnixTimestamp)   # 秒级时间戳
1Panel-Timestamp: <当前 Unix 时间戳>
```

- **Token 不是 API Key 本身**，直接用密钥会返回 `401 API 接口密钥错误`。
- 需要在面板「设置 → API 接口」启用接口，并把调用方 IP 加入白名单。
- **API 路由不受「安全入口」影响**：面板开启安全入口后，浏览器访问需要入口路径，
  但 `/api/v1/*` 仍可直接调用。

## 2. 错误表达方式

1Panel 用 **HTTP 200 + body.code** 表达业务错误，不要只看 HTTP 状态码：

```json
{ "code": 401, "message": "API 接口密钥错误", "data": null }
```

## 3. 「路由不存在」长什么样

**关键判据**：路由未注册时，1Panel 的 gin `NoRoute` 会兜底返回**安全入口守卫页的 HTML**
（`<title>暂时无法访问</title>`），而不是 JSON 404。

因此有两种等价的现象：路径不存在、HTTP 方法不对。

### 安全的路由存在性探测

**不要**带鉴权去调用来试探——部分端点的 handler 有真实副作用。用不带密钥的探测：

```bash
probe() {
  ct=$(curl -sS -m 8 -o /dev/null -w '%{content_type}' -X "$1" \
       "http://127.0.0.1:PORT/api/v1$2" -H 'Content-Type: application/json' -d '{}')
  [[ $ct == *json* ]] && echo "✓ 路由存在  $1 $2" || echo "✗ 不存在    $1 $2"
}
probe POST /containers/search
```

返回 JSON（通常是 `{"code":401,...}`）说明路由已注册且方法正确；返回 HTML 说明路由/方法不对。
这个探针停在鉴权中间件，**不会触发业务 handler，没有副作用**。

> ⚠️ 血泪教训：本项目开发期间，曾用带鉴权的真实调用去验证
> `POST /hosts/ssh/conffile/update`，结果 handler 真的把传入的测试内容
> 写进了宿主机 `/etc/ssh/sshd_config`。**验证写类端点务必用上面的无密钥探针。**

## 4. swagger 不可全信

面板二进制内嵌的 swagger 是很好的参考，但它的 `@Router` 注解**多处滞后于真实路由表**
（真实路由表在 1Panel 源码的 `backend/router/ro_*.go`）。已确认的滞后：

| swagger 记的 | 真实情况 |
|---|---|
| `GET /toolbox/clam/base` | 实际是 **POST** |
| `POST /hosts/conffile/update` | 真实路径是 **POST /hosts/ssh/conffile/update** |
| `GET /containers/repo/status` | 实际是 **POST** |
| `GET /apps/installed/conninfo/{key}` | 实际是 **POST /apps/installed/conninfo**（无 `{key}` 段） |
| `POST /settings/backup/search` | 实际是 **GET** |
| `GET /auth/language` | 无对应路由 |
| `/toolbox/fail2ban/operate/sshd` 的 `dto.Operate` | 实际 DTO 是 `dto.Fail2BanSet{ips, operate: banned\|ignore}` |
| `/containers/compose/test` 的 DTO | 与创建共用 `ComposeCreate`，`from` 必填 |

另外 swagger 是真实路由的**子集**：如 `/runtimes/installed/delete/check/{id}`、
`POST /apps/installed/conninfo` 真实存在但 swagger 没有。

**结论**：swagger 用来查 DTO 字段和枚举，路由/方法要以「无密钥探针实测」为准。

## 5. tag 分类会漏端点

例如 `POST /runtimes/del` 在 swagger 里 tag 是 `Website` 而不是 `Runtime`。
**按 tag 找端点会漏**，要按 `paths` 关键词全局搜。

## 6. 已确认的 v2 → v1 语义差异（节选）

| 能力 | v2 | v1 |
|---|---|---|
| 容器启停 | `{id, operation}` | `{names: [id], operation}` |
| 删除容器 | `POST /containers/del` | `POST /containers/operate` + `operation:"remove"` |
| 容器详情 | `{id}` | `{name}` |
| 容器日志 | `GET /containers/search/log` | `POST /containers/download/log`（直接返回纯文本） |
| Docker 状态 | `GET /containers/status` | `GET /containers/docker/status` |
| 拉取镜像 | `{name}` | `{imageName}` |
| 删除镜像/网络/卷 | `{id}` | `{names: [id]}` |
| 清理容器 | 空 body | `{pruneType: "container", withTagAll: false}` |
| 保存镜像 | `{names}` | `{tagName, path, name}` |
| compose 标识 | 数值 `id` | 字符串 `name`（且多数操作**必须带 `path`**） |
| compose 内联内容 | `content` | `file`（且 `from` 必填） |
| 应用卸载 | `POST /apps/installed/del` | `POST /apps/installed/op {installId, operate:"delete"}` |
| 主机分组 | `/hosts/groups*` | `/groups*`，且**必带 `type:"host"`** |
| 删除主机 | `{id}` | `{ids: [id]}` |
| 进程终止 | `{pid}` | `{PID}`（**大写**） |
| 监控数据 | `/monitor/*` | `/hosts/monitor/*`，`param` 必填，时间**必须 RFC3339** |
| 系统设置读取 | `GET /settings/search` | `POST /settings/search`（无 body） |
| 系统设置更新 | 对象批量 | `{key, value}` **单键**，需逐条发 |
| FTP 用户创建 | `userName` | `user`，且**密码必须 base64** |
| 系统日志 | `/logs/system/search` | `POST /logs/system {name}`，返回**纯文本** |

## 7. v1 完全没有的能力（代码里主动抛错）

- **AI Agent**（`/ai/agents/*`）、**MCP Server**（`/ai/mcp/*`）—— v2 / XPack 专有
- **GPU 监控**（v1 只有 `/ai/gpu/load`，是 Ollama 用的）
- **磁盘管理**：v1 无任何磁盘端点，磁盘用量只能从 `/dashboard/base/{io}/{net}` 的 `diskData` 只读读取
- **进程枚举**：v1 只有 `POST /process/stop`，没有列表接口
- **任务中心**：无 `/tasks/*`，进行中任务由前端 WebSocket 推送
- **面板备忘录**：无 `/dashboard/memo`
- **命令行执行**：无 HTTP 端点，只有 WebSocket（`/api/v1/terminals`）
- **PHP 运行环境配置**：v2 的 `/runtimes/php/{id}/*` 系列在 v1 全部不存在
- **compose 环境变量/日志清理**：`/containers/compose/env`、`/clean/log` 未注册

## 8. 命名冲突陷阱

`BaseAPI` 提供了 `get(path)` / `post(path, body)` 两个 HTTP 辅助方法。
如果子类自己定义了 `get(...)`（例如 `ContainerAPI.get(id)` 用于查容器详情），
**子类内部调用 `this.get(...)` 会调到自己的方法而不是 HTTP GET**，
导致请求被发到完全错误的端点。这种情况必须写 `super.get(...)`。

这个缺陷在上游 v2 版本中同样存在。
