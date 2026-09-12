import { BaseAPI } from "./base.js";

/**
 * 1Panel v1.x 存储卷 API 适配层
 *
 * 与原 v2 实现的语义差异：
 *  - 列表：v1 的分页查询是 POST /containers/volume/search + dto.SearchWithPage
 *    （page/pageSize 必填）；GET /containers/volume 只返回下拉项（dto.Options）。
 *  - 创建：v1 的 dto.VolumeCreate 必填 driver + name（v2 只传 name），
 *    driver 默认 local（面板 UI 的新建卷默认值）。
 *  - 删除：v1 的 /containers/volume/del 吃 dto.BatchDelete（必填 names: string[]），
 *    不是 v2 的 { id }。面板 UI 也是 deleteVolume({ names: [卷名] })。
 */
export class VolumeAPI extends BaseAPI {
  async list(): Promise<any> {
    return this.post("/api/v1/containers/volume/search", { page: 1, pageSize: 100 });
  }

  async create(name: string, driver = "local"): Promise<any> {
    return this.post("/api/v1/containers/volume", { name, driver });
  }

  /** v1 是批量删除：字段名是 names（数组），单个删除也走 names: [id] */
  async remove(id: string): Promise<any> {
    return this.post("/api/v1/containers/volume/del", { names: [id] });
  }
}
