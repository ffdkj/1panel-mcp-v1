import { BaseAPI } from "./base.js";

/**
 * 1Panel v1.x 回收站 API 适配层
 *
 * v1 的路径与方法同 v2 基本一致（files/recycle/*），差异只在 DTO 字段：
 *  - 列表：POST /files/recycle/search，body 是 dto.PageInfo { page, pageSize }（返回 dto.PageResult）。
 *  - 状态：GET /files/recycle/status（无参数，返回 settings.FileRecycleBin，值为 "enable"/"disable"）。
 *  - 清空：POST /files/recycle/clear（无 body）。
 *  - 还原：POST /files/recycle/reduce，v1 的 request.RecycleBinReduce 必填 { from, rName }，
 *    name 是可选的"还原后的新文件名"，所以只给一个 name 需要先反查回收站列表。
 */
export class RecycleBinAPI extends BaseAPI {
  /**
   * 获取回收站状态
   * v1：GET /files/recycle/status → "enable" / "disable"
   */
  async getStatus(): Promise<any> {
    return this.request("/api/v1/files/recycle/status", { method: "GET" });
  }

  /**
   * 列出回收站文件
   * v1：POST /files/recycle/search { page, pageSize }
   */
  async list(): Promise<any> {
    return this.post("/api/v1/files/recycle/search", { page: 1, pageSize: 100 });
  }

  /**
   * 清空回收站
   * v1：POST /files/recycle/clear（不接受参数）
   */
  async clear(): Promise<any> {
    return this.post("/api/v1/files/recycle/clear", {});
  }

  /**
   * 还原回收站文件
   *
   * v1 的 reduce 需要 { from, rName }（from=文件原目录，rName=回收站里的随机文件名），
   * 二者都在列表返回值里；这里先按 name（也接受 rName）在回收站列表里定位记录，再按原名还原。
   */
  async reduce(name: string): Promise<any> {
    const res = await this.post("/api/v1/files/recycle/search", { page: 1, pageSize: 500 });
    const items: any[] = res?.data?.items ?? [];
    const hit = items.find((item: any) => item?.name === name) ?? items.find((item: any) => item?.rName === name);
    if (!hit) {
      throw new Error(`1Panel v1 回收站中找不到 name=${name} 的文件，无法还原（可先用 list_recycle_bin 查看）`);
    }
    return this.post("/api/v1/files/recycle/reduce", {
      from: hit.from,
      rName: hit.rName,
      name: hit.name,
    });
  }
}
