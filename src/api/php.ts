import { BaseAPI } from "./base.js";

/**
 * 1Panel v1.x PHP 管理 API 适配层
 *
 * v1 与 v2 的 PHP 结构完全不同（不能只换前缀）：
 *  - v2 把 PHP 当独立资源：POST /runtimes/php 列表、GET|POST /runtimes/php/{id}/conf、
 *    GET|POST /runtimes/php/{id}/conffile、POST /runtimes/php/{id}/version、
 *    GET /runtimes/php/{id}/extensions、POST /runtimes/php/{id}/extensions/install|uninstall。
 *  - v1 里 PHP 只是 runtime 的一种（type="php"），PHP 运行环境列表 = POST /runtimes/search { type:"php" }，
 *    详情 = GET /runtimes/{id}；**上面那些 /runtimes/php/* 子路由在 v1 全都不存在**
 *    （swagger.json 无此路径，目标面板实测返回 HTML 守卫页 = 路由未命中）。
 *  - v1 的「PHP 扩展」是扩展集模板：{ id, name, extensions: "bcmath,ftp,gd,..." }，
 *    面板内置 Default / WordPress / BookStack 等，由 POST /runtimes/php/extensions/search 分页管理；
 *    v1 没有"给某个运行环境单独安装/卸载扩展"的接口。
 *    完整 v1 扩展集端点（swagger tag: PHP Extensions）：
 *      POST /runtimes/php/extensions/search   { page, pageSize, all }
 *      POST /runtimes/php/extensions          { name, extensions }
 *      POST /runtimes/php/extensions/update   { id, extensions }
 *      POST /runtimes/php/extensions/del      { id }
 *    后 3 个在 v2 的 9 个 PHP 方法里没有对应方法名，故未挂到本类（需要时在 tools/php.ts 新增工具再补方法）。
 *
 * 结论：v1 能提供的只有「PHP 运行环境列表 + PHP 扩展集列表」，其余能力按规约显式抛错。
 */
export class PHPAPI extends BaseAPI {
  /**
   * PHP 运行环境列表。
   * v2 是 POST /runtimes/php；v1 没有该端点，PHP 是 type=php 的 runtime。
   */
  async list(): Promise<any> {
    return this.post("/api/v1/runtimes/search", { type: "php", page: 1, pageSize: 100 });
  }

  /**
   * v1 无「读取 PHP 运行环境 php.ini 参数」接口（v2: GET /runtimes/php/{id}/conf）。
   * v1 的 php.ini 由面板写入运行环境目录，接口层只能通过文件管理走 /files/*，不属于 PHP 模块。
   */
  async getConf(id: number): Promise<any> {
    throw new Error(`1Panel v1 不支持该接口（v2 专有）: GET /runtimes/php/${id}/conf；v1 的 PHP 是 type=php 的 runtime，没有 php.ini 参数读写路由`);
  }

  /**
   * v1 无「写入 PHP 运行环境 php.ini 参数」接口（v2: POST /runtimes/php/{id}/conf）。
   */
  async updateConf(id: number, content: string): Promise<any> {
    throw new Error(`1Panel v1 不支持该接口（v2 专有）: POST /runtimes/php/${id}/conf（忽略 ${content?.length ?? 0} 字节配置内容）`);
  }

  /**
   * PHP 扩展集列表（v1 的「PHP 扩展」= 扩展集模板，不是某运行环境已装的扩展）。
   * 语义差异：v2 是 GET /runtimes/php/{id}/extensions（按运行环境列出已装扩展），v1 无此路由；
   * v1 的 POST /runtimes/php/extensions/search 与运行环境无关，因此 id 不参与查询。
   */
  async listExtensions(id: number): Promise<any> {
    return this.post("/api/v1/runtimes/php/extensions/search", { page: 1, pageSize: 100 });
  }

  /**
   * v1 无「给 PHP 运行环境安装扩展」接口（v2: POST /runtimes/php/{id}/extensions/install）。
   * 注意：v1 的 POST /runtimes/php/extensions/update 是"改写扩展集的 extensions 字符串"，
   * 与"往某运行环境装扩展"语义不同，不能互相替代。
   */
  async installExtension(id: number, extension: string): Promise<any> {
    throw new Error(`1Panel v1 不支持该接口（v2 专有）: POST /runtimes/php/${id}/extensions/install（扩展 ${extension}）；v1 只有扩展集模板，见 listExtensions`);
  }

  /**
   * v1 无「卸载 PHP 运行环境扩展」接口（v2: POST /runtimes/php/{id}/extensions/uninstall）。
   * 注意：v1 的 POST /runtimes/php/extensions/del 删的是整个扩展集模板，语义不同（且具破坏性）。
   */
  async uninstallExtension(id: number, extension: string): Promise<any> {
    throw new Error(`1Panel v1 不支持该接口（v2 专有）: POST /runtimes/php/${id}/extensions/uninstall（扩展 ${extension}）；v1 没有按运行环境装卸扩展的路由`);
  }

  /**
   * v1 无「读取运行环境配置文件」接口（v2: GET /runtimes/php/{id}/conffile）。
   * v1 的 php.ini / php-fpm.conf 位于运行环境目录，只能走文件管理接口（/files/*）。
   */
  async getConfFile(id: number, type: string): Promise<any> {
    throw new Error(`1Panel v1 不支持该接口（v2 专有）: GET /runtimes/php/${id}/conffile（配置文件 ${type}）`);
  }

  /**
   * v1 无「写入运行环境配置文件」接口（v2: POST /runtimes/php/{id}/conffile）。
   */
  async updateConfFile(id: number, type: string, content: string): Promise<any> {
    throw new Error(`1Panel v1 不支持该接口（v2 专有）: POST /runtimes/php/${id}/conffile（配置文件 ${type}，忽略 ${content?.length ?? 0} 字节内容）`);
  }

  /**
   * v1 无「切换 PHP 版本」接口（v2: POST /runtimes/php/{id}/version）。
   * v1 只能 POST /runtimes/update 换 image 重建整个运行环境（request.RuntimeUpdate 需要 image/params 等完整参数），
   * 不能只按版本号切换，故不在此做等价映射。
   */
  async updateVersion(id: number, version: string): Promise<any> {
    throw new Error(`1Panel v1 不支持该接口（v2 专有）: POST /runtimes/php/${id}/version（目标版本 ${version}）；v1 需用 POST /runtimes/update 换镜像重建`);
  }
}
