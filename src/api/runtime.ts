import { BaseAPI } from "./base.js";

/**
 * 1Panel v1.x 运行环境（Runtime）API 适配层
 *
 * v1 的 Runtime tag 共 9 个端点（另有 /runtimes/del 被 swagger 归到 Website tag 下）：
 *   POST /runtimes/search、POST /runtimes、POST /runtimes/del、POST /runtimes/update、
 *   POST /runtimes/operate、POST /runtimes/sync、GET /runtimes/{id}、
 *   POST /runtimes/node/modules、POST /runtimes/node/modules/operate、POST /runtimes/node/package
 *
 * 与原 v2 实现的语义差异：
 *  - 列表：v1 是 POST /runtimes/search，DTO request.RuntimeSearch 必填 { page, pageSize }，
 *    可选 { type, name, status }；PHP/Node 等语言运行环境都用 type 过滤（没有 v2 的 /runtimes/php）。
 *  - 安装：v1 是 POST /runtimes，DTO request.RuntimeCreate
 *    { appDetailId, name, resource, image, type, version, source, codeDir, remark, params,
 *      install, clean, exposedPorts, environments, volumes, extraHosts }；
 *    应用商店型运行环境必须给 appDetailId，本地型必须给 name/type/codeDir 等。
 *  - 卸载：v1 是 POST /runtimes/del，DTO request.RuntimeDelete 只有 { id, forceDelete }，
 *    **没有 type 字段**（v2 是 { type, id }）；type 参数仅为保持方法签名兼容而保留。
 *    另外 v1 删除前会检查运行环境是否被网站引用，被引用时返回 ErrDelWithWebsite。
 */
export class RuntimeAPI extends BaseAPI {
  async list(type: string): Promise<any> {
    return this.post("/api/v1/runtimes/search", { type, page: 1, pageSize: 100 });
  }

  async install(type: string, config: any): Promise<any> {
    return this.post("/api/v1/runtimes", { type, ...config });
  }

  async uninstall(type: string, id: number): Promise<any> {
    // v1 的 RuntimeDelete 只认 id / forceDelete，type 不参与请求体（仅为兼容 v2 签名保留）
    return this.post("/api/v1/runtimes/del", { id, forceDelete: false });
  }
}
