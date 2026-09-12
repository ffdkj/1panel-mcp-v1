import { BaseAPI } from "./base.js";

export interface DiskMountRequest {
  /** 设备路径 */
  path: string;
  /** 挂载点 */
  mountPoint: string;
  /** 文件系统类型 */
  fsType?: string;
  /** 选项 */
  options?: string;
}

export interface DiskPartitionRequest {
  /** 设备路径 */
  path: string;
  /** 分区类型 */
  type?: string;
}

/**
 * 1Panel v1.x 磁盘 API 适配层
 *
 * 结论（已在 v1.10.34-lts 上对照 swagger 的 405 条路径 + 真实面板逐一验证）：
 * **v1 没有磁盘管理端点。** v1 的磁盘数据只出现在 Dashboard/Monitor 的展示接口里：
 *  - GET  /dashboard/base/{ioOption}/{netOption} → dto.DashboardBase.currentInfo.diskData[]
 *  - POST /dashboard/current                     → dto.DashboardCurrent.diskData[]
 * 两个 dto.DiskInfo 只含 device/path/type/total/used/free/usedPercent/inodes*
 * （纯只读的挂载点用量），没有任何 mount / umount / partition / format 写操作端点。
 *
 * v2 的 /host/disks、/host/disks/info、/host/disks/mount、/host/disks/partition、
 * /host/disks/umount 在 v1 全部不存在（实测 GET /host/disks 与 POST /host/disk/list
 * 都命中 1Panel 的 HTML 守卫页 = 路由未注册）。
 *
 * 因此：
 *  - list() / getFullInfo() 退化为从 dashboard 读磁盘用量（可用，但字段比 v2 少）；
 *  - mount/partition/unmount 三个写操作在 v1 无等价端点，直接抛明确错误，绝不臆造路径。
 */
export class DiskAPI extends BaseAPI {
  /** 从 dashboard 实时数据里取磁盘列表（v1 唯一能读到磁盘信息的途径） */
  private async loadDiskData(): Promise<any[]> {
    const res: any = await super.get("/api/v1/dashboard/base/all/all");
    const diskData = res?.data?.currentInfo?.diskData;
    if (!Array.isArray(diskData)) {
      throw new Error(
        "1Panel v1 没有磁盘查询端点；退化取 /dashboard/base/all/all 的 currentInfo.diskData 时未取到数据" +
          "（面板未开启监控采集或该版本未返回 diskData）",
      );
    }
    return diskData;
  }

  /**
   * 获取磁盘信息
   * v1 无 /host/disks、无 /host/disks/info，退回 dashboard 的只读磁盘用量
   */
  async list(): Promise<any> {
    const diskData = await this.loadDiskData();
    return { code: 200, message: "", data: diskData };
  }

  /**
   * 获取完整磁盘信息
   * v1 没有分区表/块设备明细端点，返回的仍是 dashboard 的挂载点用量
   */
  async getFullInfo(): Promise<any> {
    const diskData = await this.loadDiskData();
    return {
      code: 200,
      message: "1Panel v1 无块设备明细端点，以下为 dashboard 挂载点用量（非 v2 的完整磁盘信息）",
      data: diskData,
    };
  }

  /**
   * 挂载磁盘
   * v1 无任何挂载端点（v2 专有 /host/disks/mount）
   */
  async mount(params: DiskMountRequest): Promise<any> {
    throw new Error(
      "1Panel v1 不支持挂载磁盘（v2 专有）: POST /host/disks/mount —— v1 全量路由里没有任何磁盘写操作端点",
    );
  }

  /**
   * 分区磁盘
   * v1 无任何分区端点（v2 专有 /host/disks/partition）
   */
  async partition(params: DiskPartitionRequest): Promise<any> {
    throw new Error(
      "1Panel v1 不支持磁盘分区（v2 专有）: POST /host/disks/partition —— v1 全量路由里没有任何磁盘写操作端点",
    );
  }

  /**
   * 卸载磁盘
   * v1 无任何卸载端点（v2 专有 /host/disks/umount）
   */
  async unmount(mountPoint: string): Promise<any> {
    throw new Error(
      "1Panel v1 不支持卸载磁盘（v2 专有）: POST /host/disks/umount —— v1 全量路由里没有任何磁盘写操作端点",
    );
  }
}
