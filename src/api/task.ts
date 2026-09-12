import { BaseAPI } from "./base.js";

/**
 * 1Panel v1.x 任务 API 适配层
 *
 * v1 没有任务（task）端点：
 *  - swagger 的 405 条路径里不存在 `/tasks/*`（也没有任何路径/定义含 "task" 字样），
 *    v2 的 /tasks/count、/tasks/search 都是 v2 专有。
 *  - 核对过 v1 tag `Logs`（/logs/operation、/logs/system、/logs/login、/logs/clean、
 *    /logs/system/files）与 tag `System Setting`（29 个端点，均为设置/快照/备份/升级），
 *    没有"执行中任务数量"或"任务日志"的 REST 端点 —— v1 面板的进行中任务
 *    由前端经 WebSocket 推送，未开放 HTTP 接口。
 *  - 因此两个方法都抛明确错误。若要查看历史执行记录，请用 logs.listOperation()。
 */
export class TaskAPI extends BaseAPI {
  /** v1 无 /tasks/count（执行中任务数是前端 WebSocket 推送，无 REST 端点） */
  async getExecutingCount(): Promise<any> {
    throw new Error("1Panel v1 不支持该接口（v2 专有）: /tasks/count —— v1 无任务计数端点，进行中任务由前端 WebSocket 推送");
  }

  /** v1 无 /tasks/search；语义最接近的是操作日志 POST /logs/operation（见 logs.listOperation） */
  async getLogs(): Promise<any> {
    throw new Error(
      "1Panel v1 不支持该接口（v2 专有）: /tasks/search —— v1 无任务日志端点；" +
        "请改用 logs.listOperation()（POST /api/v1/logs/operation）查看操作/执行记录",
    );
  }
}
