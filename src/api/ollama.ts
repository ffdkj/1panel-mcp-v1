import { BaseAPI } from "./base.js";

/**
 * 1Panel v1.x Ollama（XPack / AI tag）API 适配层
 *
 * 与原 v2 实现的语义差异：
 *  - 关闭模型连接：v1 是 POST /ai/ollama/model/close（v2 是 /ai/ollama/close），
 *    其余模型的增删加载路径 v1 与 v2 相同。
 *  - DTO：创建/加载/重建/关闭都是 dto.OllamaModelName = { name }；
 *    删除是 dto.ForceDelete = { ids: number[], forceDelete? }；
 *    分页查询是 dto.SearchWithPage = { page, pageSize, info? }。
 *  - v2 的 taskID 字段（异步任务 id）在 v1 的 DTO 里不存在，本模块的入参本来也没有它。
 */
export class OllamaAPI extends BaseAPI {
  /**
   * 列出 Ollama 模型
   * v1 dto.SearchWithPage 必填 page / pageSize。
   */
  async list(): Promise<any> {
    return this.post("/api/v1/ai/ollama/model/search", { page: 1, pageSize: 100 });
  }

  /**
   * 创建 Ollama 模型
   * v1 只接收 { name }（模型名，如 llama3:8b）。
   */
  async create(name: string): Promise<any> {
    return this.post("/api/v1/ai/ollama/model", { name });
  }

  /**
   * 删除 Ollama 模型
   * v1 dto.ForceDelete = { ids: number[], forceDelete? }，是批量删除（与 v2 一致）。
   */
  async remove(ids: number[]): Promise<any> {
    return this.post("/api/v1/ai/ollama/model/del", { ids });
  }

  /**
   * 加载 Ollama 模型（把模型读进显存）
   */
  async load(name: string): Promise<any> {
    return this.post("/api/v1/ai/ollama/model/load", { name });
  }

  /**
   * 重新创建 Ollama 模型
   */
  async recreate(name: string): Promise<any> {
    return this.post("/api/v1/ai/ollama/model/recreate", { name });
  }

  /**
   * 同步 Ollama 模型列表（v1 该端点不绑定请求体）
   */
  async sync(): Promise<any> {
    return this.post("/api/v1/ai/ollama/model/sync", {});
  }

  /**
   * 关闭 Ollama 模型连接
   * v1 的路径是 /ai/ollama/model/close（v2 是 /ai/ollama/close），body 仍是 { name }。
   */
  async close(name: string): Promise<any> {
    return this.post("/api/v1/ai/ollama/model/close", { name });
  }
}
