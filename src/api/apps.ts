import { BaseAPI } from "./base.js";

/**
 * 1Panel v1.x 应用（App Store）API 适配层
 *
 * 与原 v2 实现的语义差异（不是改前缀就能解决的）：
 *  - 安装：v2 是 POST /apps/installed；v1 是 **POST /apps/install**，
 *    DTO request.AppInstallCreate 必填 { appDetailId, name }（注意是小写 d 的 appDetailId）。
 *  - 卸载：v1 没有 /apps/installed/del，统一走 **POST /apps/installed/op**
 *    { installId, operate:"delete", deleteDB, deleteBackup, forceDelete }。
 *  - 升级：v1 没有 /apps/installed/upgrade，且 op("upgrade") 必填 detailId（目标版本），
 *    所以必须两步：先 POST /apps/installed/update/versions { appInstallID } 拿可升级版本，
 *    再 POST /apps/installed/op { installId, operate:"upgrade", detailId, dockerCompose, ... }。
 *  - 列表：/apps/installed/search 与 /apps/search 在 v1 同名同法，DTO 必填 page/pageSize。
 *  - v1 的 operate 取值（constant.AppOperate）：start|stop|restart|rebuild|reload|delete|sync|upgrade|favorite。
 */
export class AppAPI extends BaseAPI {
  /** 已安装应用分页查询：v1 与 v2 同路径（POST /apps/installed/search） */
  async listInstalled(): Promise<any> {
    return this.post("/api/v1/apps/installed/search", { page: 1, pageSize: 100 });
  }

  /** 应用商店列表：v1 与 v2 同路径（POST /apps/search） */
  async listStore(): Promise<any> {
    return this.post("/api/v1/apps/search", { page: 1, pageSize: 100 });
  }

  /**
   * 安装应用：v1 端点是 /apps/install（不是 /apps/installed）。
   * v1 request.AppInstallCreate 必填 appDetailId + name；其余可选字段按 v1 命名原样透传：
   * params / services / advanced / allowPort / dockerCompose / editCompose / hostMode /
   * pullImage / containerName / memoryLimit / memoryUnit / cpuQuota / gpuConfig / taskID。
   */
  async install(app: any): Promise<any> {
    return this.post("/api/v1/apps/install", app);
  }

  /**
   * 卸载应用：v1 无 /apps/installed/del，改用 POST /apps/installed/op + operate:"delete"。
   * 默认值与面板卸载对话框一致：删数据库(deleteDB:true)、不删备份、非强制删除。
   * 注意：若应用仍被网站等资源引用，v1 会返回 ErrDelWithWebsite，此时需先解绑。
   */
  async uninstall(id: number): Promise<any> {
    return this.post("/api/v1/apps/installed/op", {
      installId: id,
      operate: "delete",
      deleteDB: true,
      deleteBackup: false,
      forceDelete: false,
    });
  }

  /**
   * 升级应用：v1 无 /apps/installed/upgrade。
   * v2 的 { id } 无法表达目标版本，这里按面板 UI 的两步流程升级到"可升级的最高版本"：
   *   1) POST /apps/installed/update/versions { appInstallID } →
   *      服务端只返回比当前版本更高的版本 [{ version, detailId, dockerCompose }]
   *   2) POST /apps/installed/op { installId, operate:"upgrade", detailId, dockerCompose,
   *      backup:true, pullImage:true }（backup/pullImage 默认值与面板升级对话框一致）
   */
  async update(id: number): Promise<any> {
    const res = await this.post("/api/v1/apps/installed/update/versions", { appInstallID: id });
    const versions: any[] = Array.isArray(res?.data) ? res.data : [];
    if (versions.length === 0) {
      // v1 只返回"比当前版本高"的版本，空数组即没有可升级版本
      throw new Error(`应用 ${id} 没有可升级的版本（1Panel v1 的 /apps/installed/update/versions 仅返回高于当前版本的版本）`);
    }
    const latest = versions.reduce((a: any, b: any) => (compareVersion(b?.version, a?.version) > 0 ? b : a));
    return this.post("/api/v1/apps/installed/op", {
      installId: id,
      operate: "upgrade",
      detailId: latest?.detailId,
      dockerCompose: latest?.dockerCompose ?? "",
      backup: true,
      pullImage: true,
    });
  }
}

/**
 * 版本号比较（v1 应用版本形如 "2.0.1"、"8.2"）：
 * 逐段比较，两段都是数字时按数值比，否则按字符串比；缺失段按 0 处理。
 */
function compareVersion(a: string = "", b: string = ""): number {
  const pa = String(a ?? "").split(".");
  const pb = String(b ?? "").split(".");
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? "0";
    const y = pb[i] ?? "0";
    const nx = Number(x);
    const ny = Number(y);
    if (!Number.isNaN(nx) && !Number.isNaN(ny)) {
      if (nx !== ny) return nx - ny;
    } else if (x !== y) {
      return x > y ? 1 : -1;
    }
  }
  return 0;
}
