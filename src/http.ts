#!/usr/bin/env node
/**
 * HTTP 入口 —— 把 MCP server 挂到 TCP 端口上，供远程 / Tailscale 组网内的客户端访问。
 *
 * 端点：
 *   POST   /mcp        Streamable HTTP（MCP 2024-11-05 之后的标准远程传输，推荐）
 *   GET    /mcp        服务端 → 客户端 的 SSE 通知流
 *   DELETE /mcp        结束会话
 *   GET    /sse        旧版 HTTP+SSE 传输（兼容老客户端）
 *   POST   /messages   旧版 SSE 的客户端 → 服务端 上行通道
 *   GET    /health     存活探测（无需鉴权，只回版本号，不泄漏面板信息）
 *
 * 鉴权：
 *   除 /health 外全部端点都要求 MCP_TOKEN，通过下面任一方式携带：
 *     Authorization: Bearer <MCP_TOKEN>
 *     X-MCP-Token: <MCP_TOKEN>
 *
 * 环境变量：
 *   MCP_TOKEN       访问本 HTTP 服务的令牌；未设置 ONEPANEL_API_KEY 时也用作面板 API 密钥
 *   MCP_HOST        监听地址（默认 127.0.0.1；监听非回环地址时必须设置 MCP_TOKEN）
 *   MCP_PORT        监听端口（默认 8790）
 *   MCP_PATH        Streamable HTTP 路径（默认 /mcp）
 *   MCP_MAX_BODY    请求体上限字节数（默认 32 MiB，文件写入可能需要较大 body）
 *   ONEPANEL_HOST / ONEPANEL_PORT / ONEPANEL_API_KEY / ONEPANEL_PROTOCOL 见 stdio 模式
 */
import { createServer as createHttpServer, IncomingMessage, ServerResponse } from "node:http";
import { randomUUID, timingSafeEqual, createHash } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { OnePanelClient } from "./client.js";
import { createMcpServer, loadConfig, SERVER_NAME, SERVER_VERSION } from "./mcp-server.js";

/* ------------------------------------------------------------------ */
/* 配置                                                                */
/* ------------------------------------------------------------------ */

const MCP_HOST = (process.env.MCP_HOST || "127.0.0.1").trim();
const MCP_PORT = parseInt(process.env.MCP_PORT || "8790", 10);
const MCP_PATH = normalizePath(process.env.MCP_PATH || "/mcp");
const MCP_TOKEN = (process.env.MCP_TOKEN || "").trim();
const MAX_BODY = parseInt(process.env.MCP_MAX_BODY || String(32 * 1024 * 1024), 10);

function normalizePath(p: string): string {
  const t = p.trim();
  if (!t) return "/mcp";
  const withSlash = t.startsWith("/") ? t : `/${t}`;
  return withSlash.length > 1 && withSlash.endsWith("/") ? withSlash.slice(0, -1) : withSlash;
}

/** 回环地址判定：只有明确是回环才允许无鉴权启动。 */
function isLoopback(host: string): boolean {
  return host === "127.0.0.1" || host === "::1" || host === "localhost";
}

/* ------------------------------------------------------------------ */
/* 鉴权                                                                */
/* ------------------------------------------------------------------ */

/** 定长哈希后比较，避免因长度差异泄漏信息，也避免 timingSafeEqual 长度不一致抛错。 */
function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a, "utf8").digest();
  const hb = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(ha, hb);
}

function extractToken(req: IncomingMessage): string | null {
  const auth = req.headers["authorization"];
  if (typeof auth === "string") {
    const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
    if (m) return m[1].trim();
  }
  const x = req.headers["x-mcp-token"];
  if (typeof x === "string" && x.trim()) return x.trim();
  if (Array.isArray(x) && x[0]?.trim()) return x[0].trim();
  return null;
}

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-MCP-Token, Mcp-Session-Id, MCP-Protocol-Version, Last-Event-ID",
  "Access-Control-Expose-Headers": "Mcp-Session-Id",
  "Access-Control-Max-Age": "86400",
};

function sendJson(res: ServerResponse, status: number, body: unknown, extra: Record<string, string> = {}): void {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(text),
    ...CORS_HEADERS,
    ...extra,
  });
  res.end(text);
}

/** 按 MCP 规范用 JSON-RPC 错误体回应鉴权失败，而不是裸文本。 */
function sendUnauthorized(req: IncomingMessage, res: ServerResponse): void {
  const id = (req as any).__rpcId ?? null;
  sendJson(
    res,
    401,
    { jsonrpc: "2.0", error: { code: -32001, message: "Unauthorized: 缺少或错误的 MCP_TOKEN" }, id },
    { "WWW-Authenticate": `Bearer realm="${SERVER_NAME}", error="invalid_token"` },
  );
}

function sendRpcError(res: ServerResponse, status: number, code: number, message: string): void {
  sendJson(res, status, { jsonrpc: "2.0", error: { code, message }, id: null });
}

/* ------------------------------------------------------------------ */
/* 请求体读取                                                          */
/* ------------------------------------------------------------------ */

function readBody(req: IncomingMessage, limit: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > limit) {
        reject(Object.assign(new Error(`请求体超过上限 ${limit} 字节`), { code: "TOO_LARGE" }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      if (chunks.length === 0) return resolve(undefined);
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw.trim()) return resolve(undefined);
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(Object.assign(new Error("请求体不是合法 JSON"), { code: "BAD_JSON" }));
      }
    });
    req.on("error", reject);
  });
}

/* ------------------------------------------------------------------ */
/* 会话                                                                */
/* ------------------------------------------------------------------ */

/** 面板客户端在进程内共享（无状态，可安全并发使用）。 */
const panelConfig = loadConfig();
const sharedClient = new OnePanelClient(panelConfig);

const streamableSessions = new Map<string, StreamableHTTPServerTransport>();
const sseSessions = new Map<string, SSEServerTransport>();

async function newStreamableTransport(): Promise<StreamableHTTPServerTransport> {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (sid) => {
      streamableSessions.set(sid, transport);
      log(`会话建立 ${sid}（当前 ${streamableSessions.size} 个）`);
    },
  });
  transport.onclose = () => {
    const sid = transport.sessionId;
    if (sid && streamableSessions.delete(sid)) {
      log(`会话关闭 ${sid}（剩余 ${streamableSessions.size} 个）`);
    }
  };
  // 每个会话一个 Server 实例：SDK 的 Server 同一时刻只能绑定一个 transport
  await createMcpServer(sharedClient).connect(transport);
  return transport;
}

/* ------------------------------------------------------------------ */
/* 日志                                                                */
/* ------------------------------------------------------------------ */

function ts(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

function log(msg: string): void {
  console.error(`[${ts()}] ${msg}`);
}

/* ------------------------------------------------------------------ */
/* 路由                                                                */
/* ------------------------------------------------------------------ */

const SSE_PATH = "/sse";
const MESSAGES_PATH = "/messages";

async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const path = normalizePath(url.pathname);
  const method = (req.method || "GET").toUpperCase();

  // CORS 预检不带 Authorization，必须在鉴权之前放行
  if (method === "OPTIONS") {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  // 存活探测：无需鉴权，且不泄漏面板地址 / 令牌是否配置
  if (path === "/health") {
    sendJson(res, 200, { status: "ok", name: SERVER_NAME, version: SERVER_VERSION, transport: "http" });
    return;
  }

  // 鉴权
  if (MCP_TOKEN) {
    const provided = extractToken(req);
    if (!provided || !safeEqual(provided, MCP_TOKEN)) {
      log(`拒绝未授权请求 ${method} ${path}${provided ? "（令牌不匹配）" : "（未携带令牌）"}`);
      sendUnauthorized(req, res);
      return;
    }
  }

  /* ---------------- Streamable HTTP ---------------- */
  if (path === MCP_PATH) {
    if (method === "POST") {
      const body = await readBody(req, MAX_BODY);
      const sidHeader = req.headers["mcp-session-id"];
      const sid = typeof sidHeader === "string" ? sidHeader.trim() : "";

      if (sid) {
        const existing = streamableSessions.get(sid);
        if (!existing) {
          sendRpcError(res, 404, -32001, `会话不存在或已过期: ${sid}`);
          return;
        }
        await existing.handleRequest(req, res, body);
        return;
      }

      // 无 session id → 新会话（正常情况下就是 initialize 请求）
      const transport = await newStreamableTransport();
      await transport.handleRequest(req, res, body);
      return;
    }

    if (method === "GET" || method === "DELETE") {
      const sidHeader = req.headers["mcp-session-id"];
      const sid = typeof sidHeader === "string" ? sidHeader.trim() : "";
      if (!sid) {
        sendRpcError(res, 400, -32000, "缺少 Mcp-Session-Id 请求头");
        return;
      }
      const existing = streamableSessions.get(sid);
      if (!existing) {
        sendRpcError(res, 404, -32001, `会话不存在或已过期: ${sid}`);
        return;
      }
      await existing.handleRequest(req, res);
      return;
    }

    sendRpcError(res, 405, -32000, `不支持的方法: ${method}`);
    return;
  }

  /* ---------------- 旧版 HTTP + SSE ---------------- */
  if (path === SSE_PATH && method === "GET") {
    const transport = new SSEServerTransport(MESSAGES_PATH, res);
    sseSessions.set(transport.sessionId, transport);
    log(`SSE 会话建立 ${transport.sessionId}（当前 ${sseSessions.size} 个）`);
    res.on("close", () => {
      if (sseSessions.delete(transport.sessionId)) {
        log(`SSE 会话关闭 ${transport.sessionId}（剩余 ${sseSessions.size} 个）`);
      }
    });
    await createMcpServer(sharedClient).connect(transport);
    return;
  }

  if (path === MESSAGES_PATH && method === "POST") {
    const sid = url.searchParams.get("sessionId") || "";
    const transport = sseSessions.get(sid);
    if (!transport) {
      sendRpcError(res, 404, -32001, `SSE 会话不存在或已过期: ${sid || "(空)"}`);
      return;
    }
    const body = await readBody(req, MAX_BODY);
    await transport.handlePostMessage(req, res, body);
    return;
  }

  sendRpcError(res, 404, -32601, `未知端点: ${method} ${path}`);
}

/* ------------------------------------------------------------------ */
/* 启动                                                                */
/* ------------------------------------------------------------------ */

/**
 * 关键安全约束：监听非回环地址时必须有令牌。
 * 本服务持有面板管理员密钥，裸奔在网络上等于把面板交出去。
 */
function assertSafeConfig(): void {
  if (!panelConfig.apiKey) {
    console.error("错误: 缺少面板 API 密钥");
    console.error("请设置 ONEPANEL_API_KEY，或设置 MCP_TOKEN（将作为 ONEPANEL_API_KEY 使用）");
    process.exit(1);
  }
  if (!Number.isInteger(MCP_PORT) || MCP_PORT <= 0 || MCP_PORT > 65535) {
    console.error(`错误: MCP_PORT 不合法: ${process.env.MCP_PORT}`);
    process.exit(1);
  }
  if (!isLoopback(MCP_HOST) && !MCP_TOKEN) {
    console.error(`错误: 监听非回环地址 ${MCP_HOST} 时必须设置 MCP_TOKEN`);
    console.error("该服务持有面板管理员密钥，暴露在网络上必须启用鉴权。");
    console.error("若确实要在本机测试，请设 MCP_HOST=127.0.0.1。");
    process.exit(1);
  }
}

function banner(): void {
  const base = `http://${MCP_HOST.includes(":") ? `[${MCP_HOST}]` : MCP_HOST}:${MCP_PORT}`;
  const keySrc = (process.env.ONEPANEL_API_KEY || "").trim()
    ? "ONEPANEL_API_KEY"
    : "MCP_TOKEN（回退）";
  console.error("");
  console.error(`  1panel-mcp-v1 ${SERVER_VERSION} —— HTTP 传输`);
  console.error(`  ─────────────────────────────────────────────────────`);
  console.error(`  监听地址     ${MCP_HOST}:${MCP_PORT}${isLoopback(MCP_HOST) ? "" : "（非回环）"}`);
  console.error(`  MCP 端点     ${base}${MCP_PATH}       (Streamable HTTP)`);
  console.error(`  兼容端点     ${base}${SSE_PATH} + ${MESSAGES_PATH}   (旧版 SSE)`);
  console.error(`  健康检查     ${base}/health`);
  console.error(`  1Panel 面板  ${panelConfig.protocol}://${panelConfig.host}:${panelConfig.port}`);
  console.error(`  面板密钥来源 ${keySrc}`);
  console.error(`  访问令牌     ${MCP_TOKEN ? `已启用（${MCP_TOKEN.length} 字符，Bearer / X-MCP-Token）` : "未启用（仅回环，无鉴权）"}`);
  console.error(`  工具数量     257`);
  console.error("");
}

async function main(): Promise<void> {
  assertSafeConfig();

  const server = createHttpServer((req, res) => {
    const started = Date.now();
    const method = req.method || "GET";
    const path = req.url || "/";
    res.on("finish", () => {
      log(`${method} ${path} → ${res.statusCode} (${Date.now() - started}ms)`);
    });
    route(req, res).catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      if ((err as any)?.code === "TOO_LARGE") {
        sendRpcError(res, 413, -32000, msg);
      } else if ((err as any)?.code === "BAD_JSON") {
        sendRpcError(res, 400, -32700, msg);
      } else {
        log(`请求处理异常 ${method} ${path}: ${msg}`);
        if (!res.headersSent) sendRpcError(res, 500, -32603, msg);
        else res.end();
      }
    });
  });

  // SSE 是长连接，默认 300s 的 requestTimeout 会把流掐断
  server.requestTimeout = 0;
  server.headersTimeout = 65_000;
  server.keepAliveTimeout = 120_000;
  server.timeout = 0;

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(MCP_PORT, MCP_HOST, () => {
      server.off("error", reject);
      resolve();
    });
  });

  banner();

  const shutdown = async (sig: string) => {
    log(`收到 ${sig}，正在关闭…`);
    for (const t of streamableSessions.values()) await t.close().catch(() => {});
    for (const t of sseSessions.values()) await t.close().catch(() => {});
    streamableSessions.clear();
    sseSessions.clear();
    server.close(() => process.exit(0));
    // 兜底：连接迟迟不释放也要退出
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  const e = err as NodeJS.ErrnoException;
  if (e?.code === "EADDRINUSE") {
    console.error(`错误: 端口被占用 ${MCP_HOST}:${MCP_PORT}`);
  } else if (e?.code === "EADDRNOTAVAIL") {
    console.error(`错误: 本机没有地址 ${MCP_HOST}（Tailscale 未启动？用 tailscale ip -4 确认）`);
  } else if (e?.code === "EACCES") {
    console.error(`错误: 无权限绑定 ${MCP_HOST}:${MCP_PORT}（1024 以下端口需要特权）`);
  } else {
    console.error("HTTP 服务启动失败:", err);
  }
  process.exit(1);
});
