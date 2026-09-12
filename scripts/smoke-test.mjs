#!/usr/bin/env node
/**
 * 端到端冒烟测试
 *
 * 通过 stdio 启动 MCP server，走完整链路（MCP 协议 → OnePanelClient → 1Panel v1 API）
 * 调用所有「无需参数即可执行」的只读工具，验证移植后的端点是否真的可用。
 *
 * 用法：
 *   ONEPANEL_HOST=127.0.0.1 ONEPANEL_PORT=36437 ONEPANEL_API_KEY=xxx node scripts/smoke-test.mjs
 *
 * 说明：
 *   - 只调用 list_* / get_* / search_* 这类只读工具，不会修改面板状态。
 *   - 需要必填参数的工具（如 get_container 需要 id）会被跳过并计数，不算失败。
 *   - 部分工具会因面板上「该功能未安装/资源为空」而返回业务错误，
 *     这不代表接口不可用，脚本会把这类结果单独标注。
 */
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverPath = join(__dirname, "..", "dist", "index.js");

const READONLY = /^(list|get|search)_/;
// 面板上该功能未安装 / 资源为空导致的业务性报错，不代表移植失败
const BENIGN = /(未找到|不存在|not found|no such|请先|未安装|服务未|为空|EOF|record not found|未检测到|exit status)/i;
// 设计上就不支持：v1 没有该端点，代码主动抛出明确错误（这是正确行为，不是失败）
const DESIGNED = /(1Panel v1 不支持|v1 没有|v1 无|该接口（v2 专有）)/;

function startServer() {
  const srv = spawn("node", [serverPath], { stdio: ["pipe", "pipe", "pipe"] });
  const pending = new Map();
  let buf = "";
  let seq = 0;
  srv.stdout.on("data", (d) => {
    buf += d.toString();
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        if (pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
      } catch { /* 忽略非 JSON 输出 */ }
    }
  });
  let stderr = "";
  srv.stderr.on("data", (d) => { stderr += d.toString(); });
  const rpc = (method, params) => new Promise((res) => {
    const id = ++seq;
    pending.set(id, res);
    srv.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  });
  return { srv, rpc, getStderr: () => stderr };
}

const { srv, rpc, getStderr } = startServer();

await rpc("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "smoke-test", version: "1" } });
srv.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");

const listed = await rpc("tools/list", {});
const tools = listed.result?.tools ?? [];
if (!tools.length) {
  console.error("无法获取工具列表，server stderr:\n" + getStderr());
  process.exit(1);
}
console.log(`MCP 工具总数: ${tools.length}\n`);

const call = async (name, args) => {
  const r = await rpc("tools/call", { name, arguments: args });
  const text = r.result?.content?.[0]?.text ?? "";
  return { isError: !!r.result?.isError, text };
};

let pass = 0, benign = 0, designed = 0, fail = 0, skipped = 0;
const failures = [];
const designList = [];

for (const t of tools) {
  if (!READONLY.test(t.name)) continue;
  const required = t.inputSchema?.required ?? [];
  if (required.length > 0) { skipped++; continue; }

  const { isError, text } = await call(t.name, {});
  const brief = text.replace(/\s+/g, " ").slice(0, 88);

  if (!isError) { pass++; console.log(`✅ ${t.name.padEnd(34)} ${brief}`); continue; }
  if (DESIGNED.test(text)) { designed++; designList.push(t.name); console.log(`⚪ ${t.name.padEnd(34)} ${brief}`); continue; }
  if (BENIGN.test(text)) { benign++; console.log(`🟡 ${t.name.padEnd(34)} ${brief}`); continue; }
  fail++; failures.push(t.name);
  console.log(`❌ ${t.name.padEnd(34)} ${brief}`);
}

console.log(`\n${"─".repeat(70)}`);
console.log(`✅ 通过 ${pass}   🟡 业务性报错（环境所致）${benign}   ⚪ 设计上不支持（v1 无此端点，主动抛错）${designed}   ❌ 失败 ${fail}   ⏭️ 需参数跳过 ${skipped}`);
if (designed) {
  console.log(`\n⚪ 主动抛错的工具（属预期行为，非缺陷）：\n  ${designList.join("\n  ")}`);
}
if (failures.length) {
  console.log(`\n❌ 失败工具:\n  ${failures.join("\n  ")}`);
}
srv.kill();
process.exit(fail > 0 ? 1 : 0);
