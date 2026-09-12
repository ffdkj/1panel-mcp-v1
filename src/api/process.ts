import { BaseAPI } from "./base.js";

/**
 * 1Panel v1.x 进程 API 适配层
 *
 * 关键差异：
 *  - 结束进程：v2 是 POST /api/v1/processes/kill + { pid }；
 *    v1 是 POST /api/v1/process/stop + { PID }（**全部大写**，
 *    对应 Go 结构体 request.ProcessReq，实测小写 pid 会因字段缺失报 400）。
 *  - 进程列表：v1 的 Process tag 只有 `/process/stop` 这一个端点，
 *    全量 405 条路径里没有任何进程枚举接口（实测 POST /processes/search 命中
 *    1Panel 的 HTML 守卫页 = 路由未注册），故 list() 只能抛明确错误。
 *    若要进程总数，可走 /dashboard/base/all/all（virtualizationSystem.procs）
 *    或 /toolbox/device/base，二者都只给数量、给不了进程列表。
 */
export class ProcessAPI extends BaseAPI {
  /**
   * 列出进程
   * v1 无进程列表端点（v2 专有 /processes/search）
   */
  async list(): Promise<any> {
    throw new Error(
      "1Panel v1 不支持该接口（v2 专有）: POST /processes/search —— " +
        "v1 的 Process tag 仅有 /process/stop，无进程枚举端点",
    );
  }

  /**
   * 结束进程
   * v1 端点为 /process/stop，字段名是 PID（大写）
   */
  async kill(pid: number): Promise<any> {
    return this.post("/api/v1/process/stop", { PID: pid });
  }
}
