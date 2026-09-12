import { BaseAPI } from "./base.js";

/**
 * 1Panel v1.x 系统信息 API 适配层
 *
 * 原 v2 实现只有两个方法，且都指向 v2 专有端点 POST /toolbox/device/monitor（不存在）。
 *
 * v1（1.10.34-lts）实测对应关系：
 *  - 系统/设备基础信息 → POST /toolbox/device/base（无请求体，返回 dto.DeviceBaseInfo：
 *    hostname、dns、hosts、timeZone、localTime、ntp、user、swapMemory 系列、maxSize）；
 *    再叠加 GET /dashboard/base/os（os、platform、kernelArch、kernelVersion、diskSize）。
 *  - 实时监控数据 → GET /dashboard/base/{ioOption}/{netOption}，返回 dto.DashboardBase
 *    （含 currentInfo：uptime、ioRead/WriteBytes、netBytesSent/Recv、shotTime 等）。
 *    v1 没有 v2 的 /toolbox/device/monitor。
 *  - 历史监控时间序列不在这里，属于 MonitorAPI（POST /hosts/monitor/search）。
 */
export class SystemAPI extends BaseAPI {
  /** 系统信息 = 设备基础信息（/toolbox/device/base）+ 操作系统信息（/dashboard/base/os） */
  async getInfo(): Promise<any> {
    const [device, os] = await Promise.all([
      this.post("/api/v1/toolbox/device/base", {}),
      super.get("/api/v1/dashboard/base/os"),
    ]);
    return { ...device, data: { ...(device?.data ?? {}), ...(os?.data ?? {}) } };
  }

  /** 实时监控：v1 走 dashboard base，需要 ioOption/netOption 两个路径参数（面板 UI 与实测都用 all） */
  async getMonitor(): Promise<any> {
    return super.get("/api/v1/dashboard/base/all/all");
  }
}
