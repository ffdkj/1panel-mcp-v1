import { BaseAPI } from "./base.js";

/**
 * 1Panel v1.x 网络 API 适配层
 *
 * 与原 v2 实现的语义差异：
 *  - 列表：v1 的分页查询是 POST /containers/network/search + dto.SearchWithPage
 *    （page/pageSize 必填）；GET /containers/network 只返回下拉项（dto.Options），不适合当列表用。
 *  - 删除：v1 的 /containers/network/del 吃 dto.BatchDelete（必填 names: string[]），
 *    不是 v2 的 { id }。面板 UI 也是 deleteNetwork({ names: [网络名] })。
 */
export class NetworkAPI extends BaseAPI {
  async list(): Promise<any> {
    return this.post("/api/v1/containers/network/search", { page: 1, pageSize: 100 });
  }

  /** v1 dto.NetworkCreate 必填 driver + name（driver 默认 bridge，与面板 UI 一致） */
  async create(name: string, driver = "bridge"): Promise<any> {
    return this.post("/api/v1/containers/network", { name, driver });
  }

  /** v1 是批量删除：字段名是 names（数组），单个删除也走 names: [id] */
  async remove(id: string): Promise<any> {
    return this.post("/api/v1/containers/network/del", { names: [id] });
  }
}
