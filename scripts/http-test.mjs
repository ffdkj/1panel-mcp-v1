#!/usr/bin/env node
/**
 * HTTP 传输端到端测试
 *
 * 走真实网络栈验证 HTTP 模式的鉴权、会话与工具调用：
 *   1. GET  /health              无鉴权也能通（存活探测）
 *   2. POST /mcp  无令牌          → 401
 *   3. POST /mcp  错误令牌        → 401
 *   4. GET  /mcp  无令牌          → 401
 *   5. 正确令牌 → initialize / tools/list / 真实工具调用
 *   6. POST /mcp  伪造 session id → 404
 *   7. 关闭会话
 *
 * 用法：
 *   MCP_TOKEN=xxx MCP_HOST=100.x.y.z MCP_PORT=8790 node scripts/http-test.mjs
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const HOST = process.env.MCP_HOST || "127.0.0.1";
const PORT = process.env.MCP_PORT || "8790";
const TOKEN = process.env.MCP_TOKEN || "";
const BASE = `http://${HOST}:${PORT}`;

let pass = 0;
let fail = 0;

function ok(label, detail = "") {
  pass++;
  console.log(`✅ ${label}${detail ? "  " + detail : ""}`);
}
function bad(label, detail = "") {
  fail++;
  console.log(`❌ ${label}${detail ? "  " + detail : ""}`);
}
function check(cond, label, detail = "") {
  if (cond) ok(label, detail);
  else bad(label, detail);
}

/** 原始 JSON-RPC initialize 请求体 */
const INIT_BODY = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "http-test", version: "1" },
  },
};

async function postMcp(headers, body = INIT_BODY) {
  return fetch(`${BASE}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...headers },
    body: JSON.stringify(body),
  });
}

console.log(`\n目标: ${BASE}   (令牌: ${TOKEN ? TOKEN.length + " 字符" : "未设置"})\n`);

/* ---------- 1. /health ---------- */
try {
  const r = await fetch(`${BASE}/health`);
  const j = await r.json().catch(() => null);
  check(r.status === 200 && j?.status === "ok", "GET /health 存活探测", `→ ${r.status} ${JSON.stringify(j)}`);
} catch (e) {
  bad("GET /health 存活探测", `→ ${e.message}`);
}

/* ---------- 2~4. 鉴权 ---------- */
if (TOKEN) {
  const r1 = await postMcp({}).catch((e) => ({ status: 0, _err: e.message }));
  check(r1.status === 401, "无令牌 POST /mcp 被拒绝", `→ ${r1.status || r1._err}`);

  const r2 = await postMcp({ Authorization: "Bearer wrong-token-xxx" });
  check(r2.status === 401, "错误令牌 POST /mcp 被拒绝", `→ ${r2.status}`);

  const r3 = await postMcp({ Authorization: TOKEN }); // 缺 "Bearer " 前缀
  check(r3.status === 401, "令牌缺少 Bearer 前缀被拒绝", `→ ${r3.status}`);

  const r4 = await fetch(`${BASE}/mcp`, { headers: { Accept: "text/event-stream" } });
  check(r4.status === 401, "无令牌 GET /mcp 被拒绝", `→ ${r4.status}`);

  const r5 = await postMcp({ "X-MCP-Token": TOKEN });
  check(r5.status === 200, "X-MCP-Token 请求头可用", `→ ${r5.status}`);
  r5.body?.cancel?.();

  const auth = await postMcp({ Authorization: `Bearer ${TOKEN}` });
  check(auth.status === 200, "正确令牌 POST /mcp 被接受", `→ ${auth.status}`);
  auth.body?.cancel?.();
}

/* ---------- 5. 完整 MCP 会话 ---------- */
let client;
try {
  const transport = new StreamableHTTPClientTransport(new URL(`${BASE}/mcp`), {
    requestInit: { headers: { Authorization: `Bearer ${TOKEN}` } },
  });
  client = new Client({ name: "http-test", version: "1.0.0" }, { capabilities: {} });
  await client.connect(transport);
  ok("initialize 握手成功", `session=${transport.sessionId || "(无)"}`);

  const { tools } = await client.listTools();
  check(Array.isArray(tools) && tools.length === 257, "tools/list 返回工具清单", `→ ${tools?.length} 个`);

  // 真实工具调用：读只读数据，验证 HTTP → MCP → 面板 全链路
  const containers = await client.callTool({ name: "list_containers", arguments: {} });
  const cText = containers.content?.[0]?.text || "";
  let cOk = false;
  try {
    const parsed = JSON.parse(cText);
    cOk = parsed?.code === 200;
  } catch { /* 非 JSON 即失败 */ }
  check(cOk && !containers.isError, "调用 list_containers（真实面板数据）", `→ ${cText.slice(0, 90).replace(/\s+/g, " ")}`);

  const hosts = await client.callTool({ name: "list_hosts", arguments: {} });
  const hText = hosts.content?.[0]?.text || "";
  let hOk = false;
  try {
    hOk = JSON.parse(hText)?.code === 200;
  } catch { /* ignore */ }
  check(hOk && !hosts.isError, "调用 list_hosts（真实面板数据）", `→ ${hText.slice(0, 90).replace(/\s+/g, " ")}`);

  const sys = await client.callTool({ name: "get_system_info", arguments: {} });
  const sText = sys.content?.[0]?.text || "";
  let sOk = false;
  try {
    sOk = JSON.parse(sText)?.code === 200;
  } catch { /* ignore */ }
  check(sOk && !sys.isError, "调用 get_system_info（真实面板数据）", `→ ${sText.slice(0, 90).replace(/\s+/g, " ")}`);

  // 未知工具应报错而不是崩掉 server
  const unknown = await client.callTool({ name: "no_such_tool_xyz", arguments: {} });
  check(unknown.isError === true, "未知工具返回错误而非崩溃", `→ ${(unknown.content?.[0]?.text || "").slice(0, 60)}`);
} catch (e) {
  bad("MCP 会话", `→ ${e.message}`);
}

/* ---------- 6. 伪造 session ---------- */
if (TOKEN) {
  const r = await postMcp(
    { Authorization: `Bearer ${TOKEN}`, "Mcp-Session-Id": "00000000-dead-beef-0000-000000000000" },
    { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
  );
  check(r.status === 404, "伪造 session id 被拒绝", `→ ${r.status}`);
}

/* ---------- 7. 关闭 ---------- */
if (client) {
  try {
    await client.close();
    ok("会话正常关闭");
  } catch (e) {
    bad("会话正常关闭", `→ ${e.message}`);
  }
}

console.log(`\n${"─".repeat(60)}`);
console.log(`${fail === 0 ? "✅ 全部通过" : "❌ 存在失败"}   通过 ${pass}   失败 ${fail}\n`);
process.exit(fail === 0 ? 0 : 1);
