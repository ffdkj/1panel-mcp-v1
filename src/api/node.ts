import { BaseAPI } from "./base.js";

/**
 * 1Panel v1.x Node 运行环境 API 适配层
 *
 * v1 的 Runtime tag 里 Node 相关只有 3 个端点，且**全部是 POST + body，没有路径参数**：
 *   POST /runtimes/node/modules          { ID }                              → 模块列表
 *   POST /runtimes/node/modules/operate  { ID, operate, module, pkgManager } → 安装/卸载/更新模块
 *   POST /runtimes/node/package          { codeDir }                         → package.json scripts
 *
 * 与原 v2 实现的语义差异：
 *  - v2 把运行环境 id 放在路径里（/runtimes/node/{id}/modules/operate、/runtimes/node/{id}/package）；
 *    v1 改为请求体，且字段名是**大写 ID**（Go json tag "ID"，request.NodeModuleReq/NodeModuleOperateReq），
 *    写成小写 id 会因 validate:"required" 校验失败。
 *  - /runtimes/node/package 在 v1 只认 codeDir（不认 id）：这里先用 GET /runtimes/{id} 取运行环境的
 *    codeDir 再调用；调用方若已在 params.codeDir 中给出，则省掉这次请求。
 *  - operate 取值 install|uninstall|update，pkgManager 取值 npm|yarn（v1 内部执行
 *    docker exec <容器> <npm|yarn> <install|add|uninstall|remove|update|upgrade> <module>）。
 */
export class NodeAPI extends BaseAPI {
  /** 模块列表：v1 是 POST /runtimes/node/modules + { ID }（v2 是 GET /runtimes/node/{id}/modules） */
  async getModules(id: number): Promise<any> {
    return this.post("/api/v1/runtimes/node/modules", { ID: id });
  }

  /**
   * 操作模块：v1 走 POST /runtimes/node/modules/operate，
   * DTO request.NodeModuleOperateReq { ID, operate, module, pkgManager }（ID 由方法参数补上）。
   */
  async operateModule(id: number, params: any): Promise<any> {
    return this.post("/api/v1/runtimes/node/modules/operate", { ...params, ID: id });
  }

  /**
   * 包脚本：v1 走 POST /runtimes/node/package + { codeDir }（request.NodePackageReq 只有 codeDir）。
   * 先用 id 反查运行环境的 codeDir；params.codeDir 优先。
   */
  async getPackageScripts(id: number, params: any): Promise<any> {
    let codeDir: string | undefined = params?.codeDir;
    if (!codeDir) {
      const runtime = await super.get(`/api/v1/runtimes/${id}`);
      codeDir = runtime?.data?.codeDir;
    }
    if (!codeDir) {
      throw new Error(
        `无法确定 Node 运行环境 ${id} 的代码目录：1Panel v1 的 /runtimes/node/package 只接受 codeDir，` +
          `请在 params.codeDir 中显式指定`,
      );
    }
    return this.post("/api/v1/runtimes/node/package", { codeDir });
  }
}
