import { BaseAPI } from "./base.js";

/**
 * 1Panel v1.x OpenResty（XPack）API 适配层
 *
 * 1Panel v1.10.34-lts 的 OpenResty tag 只有 6 个端点：
 *   GET  /openresty         载入主配置
 *   GET  /openresty/status  运行状态
 *   POST /openresty/file    按文件内容更新配置
 *   POST /openresty/scope   读取局部（scope）配置
 *   POST /openresty/update  按 scope 更新配置
 *   POST /openresty/clear   清理代理缓存（本模块没有对应方法）
 *
 * 与原 v2 实现的语义差异：
 *  - v2 的 /openresty/build（编译安装 OpenResty）与 /openresty/modules（模块列表/安装）
 *    在 v1 里**不存在**（v1 只有上面 6 个端点），对应方法改为抛明确错误。
 *  - 取局部配置：v1 是 POST /openresty/scope（request.NginxScopeReq 必填 scope），
 *    v2 的 GET /openresty/partial 在 v1 不存在。
 *  - 更新配置：v1 的 POST /openresty/update 是「按 scope 的字段级更新」
 *    （request.NginxConfigUpdate 必填 operate ∈ add|update|delete），
 *    整份文件覆盖要用 POST /openresty/file。
 */
export class OpenRestyAPI extends BaseAPI {
  /**
   * 获取 OpenResty 主配置
   * v1 是 GET /openresty（v2 相同，原实现写的 /openresty/conf 在 v1 不存在）。
   */
  async getConf(): Promise<any> {
    return this.get("/api/v1/openresty");
  }

  /**
   * 构建 OpenResty
   * 1Panel v1 不支持该接口（v2 专有）: /openresty/build
   * v1 的 OpenResty tag 没有编译/构建端点（面板里 OpenResty 由应用商店安装升级）。
   */
  async build(params: any): Promise<any> {
    throw new Error("1Panel v1 不支持该接口（v2 专有）: /openresty/build（OpenResty 由应用商店安装/升级）");
  }

  /**
   * 通过文件内容更新 OpenResty 配置
   * v1 request.NginxConfigFileUpdate = { content, backup? }（content 必填），
   * 是整份配置覆盖写入；backup 表示是否保留旧配置备份。
   */
  async updateByFile(content: string): Promise<any> {
    return this.post("/api/v1/openresty/file", { content, backup: false });
  }

  /**
   * 获取 OpenResty 模块
   * 1Panel v1 不支持该接口（v2 专有）: /openresty/modules
   * v1 没有模块列表端点（模块随 OpenResty 安装包固定），无法降级实现。
   */
  async getModules(): Promise<any> {
    throw new Error("1Panel v1 不支持该接口（v2 专有）: /openresty/modules");
  }

  /**
   * 更新 OpenResty 模块
   * 1Panel v1 不支持该接口（v2 专有）: /openresty/modules/update
   */
  async updateModule(params: any): Promise<any> {
    throw new Error("1Panel v1 不支持该接口（v2 专有）: /openresty/modules/update");
  }

  /**
   * 获取部分 OpenResty 配置
   * v1 是 POST /openresty/scope + request.NginxScopeReq，scope 必填且取值来自
   * dto.NginxKey：index | limit-conn | ssl | cache | http-per | proxy-cache。
   * 原方法没有入参，这里补一个带默认值的可选参数（老调用方不传参也能用）。
   */
  async getPartialConf(scope: string = "index"): Promise<any> {
    return this.post("/api/v1/openresty/scope", { scope });
  }

  /**
   * 获取 OpenResty 状态
   * v1 是 GET /openresty/status（v2 相同）。
   */
  async getStatus(): Promise<any> {
    return this.get("/api/v1/openresty/status");
  }

  /**
   * 更新 OpenResty 配置
   * v1 request.NginxConfigUpdate = { operate, scope, params?, websiteId? }，operate 必填（add|update|delete）；
   * 缺 operate 后端会 400，这里提前抛错并提示改用 updateByFile 做整份覆盖。
   */
  async updateConf(params: any): Promise<any> {
    if (!params?.operate) {
      throw new Error(
        "1Panel v1 的 /openresty/update 要求 operate（add|update|delete）+ scope（index|limit-conn|ssl|cache|http-per|proxy-cache）；" +
          "如果要整份覆盖配置文件，请改用 updateByFile(content)",
      );
    }
    return this.post("/api/v1/openresty/update", params);
  }
}
