import { BaseAPI } from "./base.js";

/**
 * 1Panel v1.x 计划任务 API 适配层
 *
 * 与原 v2 实现的语义差异：
 *  - 列表：v1 POST /cronjobs/search 的 dto.PageCronjob 必填 order / orderBy / page / pageSize
 *    （缺 order/orderBy 会被校验拦下），v2 只要求 page/pageSize。
 *  - 删除：v1 是批量删除 dto.CronjobBatchDelete = { ids: number[] }（v2 的路径也是 /cronjobs/del，
 *    但原实现传的是 { id }，v1 会因 ids 缺失直接 400）。
 *  - 创建：v1 dto.CronjobCreate 必填 name / spec / type，其余字段按任务类型给
 *    （command、script、containerName、appID、website、dbType、dbName、url、sourceDir、retainCopies 等），
 *    v1 没有 v2 的 groupID / alertMethod / scopes / scriptID / timeout 等新字段。
 *  - v1 还有 /cronjobs/update、/cronjobs/status、/cronjobs/handle、/cronjobs/search/records、
 *    /cronjobs/records/log、/cronjobs/records/clean 等端点，本模块的公开方法集暂不涉及。
 */
export class CronjobAPI extends BaseAPI {
  /**
   * 列出计划任务
   * v1 是分页查询，order/orderBy 为必填（order 传 "null" 表示默认排序，面板同样用法）。
   */
  async list(): Promise<any> {
    return this.post("/api/v1/cronjobs/search", {
      page: 1,
      pageSize: 100,
      order: "null",
      orderBy: "created_at",
      info: "",
    });
  }

  /**
   * 创建计划任务
   * v1 request（dto.CronjobCreate）必填 name / spec / type；
   * type 决定要带哪些字段，例如：
   *  - shell/脚本：command 或 script
   *  - 备份应用/网站/数据库：appID / website / dbType + dbName、sourceDir、retainCopies 等
   * 这里原样透传 job，字段名与 v2 相同（v1 缺的新字段会被后端忽略或报未知字段）。
   */
  async create(job: any): Promise<any> {
    return this.post("/api/v1/cronjobs", job);
  }

  /**
   * 删除计划任务
   * v1 dto.CronjobBatchDelete = { ids: number[] }（批量），不是 { id }。
   */
  async remove(id: number): Promise<any> {
    return this.post("/api/v1/cronjobs/del", { ids: [id] });
  }
}
