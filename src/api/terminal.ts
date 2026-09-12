import { BaseAPI } from "./base.js";

/**
 * 1Panel v1.x 终端 API 适配层
 *
 * v1 没有对应的 REST 端点：
 *  - swagger 里 tag `Terminal` 覆盖 0 个端点；v1 的终端能力只有两条 WebSocket 路由
 *    （backend/router/ro_terminal.go 的 GET /api/v1/terminals、ro_container.go 的
 *    GET /api/v1/containers/exec，均为 gorilla/websocket 升级），
 *    没有任何"提交一条命令、拿回 stdout"的 HTTP 接口。
 *  - 另一个容易误用的端点 POST /hosts/command 属于 tag `Command`，是"快捷命令"的
 *    增删改查（dto.CommandOperate = { name, command, groupBelong }），不是命令执行，
 *    原实现把它当成命令执行是错的。
 *  - 因此这里统一抛明确错误，而不是打到一个语义不符的端点上。
 *    需要执行命令时：v1 面板请在"终端"页操作，或直接用宿主机 SSH。
 */
export class TerminalAPI extends BaseAPI {
  /** v1 无 REST 命令执行端点（仅 WebSocket），保留方法名以免破坏 client.ts / tools 的调用 */
  async execCommand(command: string, cwd?: string): Promise<any> {
    void command;
    void cwd;
    throw new Error(
      "1Panel v1 不支持该接口（v2 专有）: 命令执行 —— v1 只有 WebSocket 终端 " +
        "（GET /api/v1/terminals 本机、GET /api/v1/containers/exec 容器），无 HTTP REST 端点；" +
        "注：POST /hosts/command 是快捷命令 CRUD，不是命令执行。请改用宿主机 SSH 或在面板终端页执行。",
    );
  }
}
