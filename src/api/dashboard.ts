import { BaseAPI } from "./base.js";

/**
 * 1Panel v1.x 仪表盘 API 适配层（v1 tag `Dashboard`，共 4 个端点）
 *
 * 与原 v2 实现的语义差异：
 *  - 基础信息：v1 是 GET /dashboard/base/{ioOption}/{netOption}（路径参数必填，不是 GET /dashboard/base），
 *    io/net 选项取 "all" 或具体设备名（前端默认 "all"）。
 *  - 当前信息：v1 是 POST /dashboard/current（不是 GET），
 *    body 是 dto.DashboardReq = { scope, ioOption, netOption }；
 *    后端只在 scope == "basic" 时返回 CPU/内存/负载等，故默认 scope:"basic"。
 *  - 备忘录：v1 的 Dashboard 4 个端点为 /base/os、/base/{io}/{net}、/current、
 *    /system/restart/{operation}，没有 /dashboard/memo（把 swagger 里 37 处 "memo"
 *    全部核对过，都是 memory/memoryUsed 之类的子串），v2 的备忘录是 v2 专有，
 *    故 getMemo / updateMemo 抛明确错误。
 */
export class DashboardAPI extends BaseAPI {
  /** 获取仪表盘基础信息（v1: GET /dashboard/base/{ioOption}/{netOption}） */
  async getBaseInfo(ioOption = "all", netOption = "all"): Promise<any> {
    return this.get(`/api/v1/dashboard/base/${deviceSegment(ioOption)}/${deviceSegment(netOption)}`);
  }

  /** 获取仪表盘当前信息（v1: POST /dashboard/current，需 body { scope:"basic" }） */
  async getCurrentInfo(scope = "basic", ioOption = "all", netOption = "all"): Promise<any> {
    return this.post("/api/v1/dashboard/current", { scope, ioOption, netOption });
  }

  /** v1 无 /dashboard/memo（Dashboard tag 仅 4 个端点） */
  async getMemo(): Promise<any> {
    throw new Error("1Panel v1 不支持该接口（v2 专有）: /dashboard/memo —— v1 的 Dashboard 只有 base/os、base/{io}/{net}、current、system/restart");
  }

  /** v1 无 /dashboard/memo；可用 settings.update({ key, value }) 写 Setting 表，但没有等价的备忘录接口 */
  async updateMemo(content: string): Promise<any> {
    void content;
    throw new Error("1Panel v1 不支持该接口（v2 专有）: POST /dashboard/memo —— v1 没有仪表盘备忘录端点");
  }

  /** 获取操作系统信息（v1 额外端点：GET /dashboard/base/os） */
  async getOsInfo(): Promise<any> {
    return this.get("/api/v1/dashboard/base/os");
  }

  /** 重启面板/系统（v1: POST /dashboard/system/restart/{operation}，operation ∈ 1panel|system） */
  async restart(operation: "1panel" | "system" = "1panel"): Promise<any> {
    return this.post(`/api/v1/dashboard/system/restart/${operation}`, {});
  }
}

/**
 * 路径段白名单校验：io/net 选项要么是 "all"，要么是设备名（如 vda、eth0、enp0s3）。
 * 这些值会拼进 URL 路径，必须挡住 "/" 和 "%" 等越权字符，避免路径被改写。
 */
function deviceSegment(value: string): string {
  if (!/^[A-Za-z0-9_.:-]+$/.test(value)) {
    throw new Error(`1Panel v1 的 io/net 选项非法（只允许 "all" 或设备名，如 vda、eth0）: ${value}`);
  }
  return value;
}
