import { BaseAPI } from "./base.js";

/**
 * 1Panel v1.x 日志 API 适配层（v1 tag `Logs`，共 5 个端点）
 *
 * 与原 v2 实现的语义差异：
 *  - 路径：v1 是 POST /logs/operation、POST /logs/system（没有 /search 后缀）。
 *  - 方法：两者都是 POST（不是 GET）。
 *  - 请求体：/logs/operation 必填 dto.SearchOpLogWithPage = { page, pageSize }，
 *    可选 operation、source、status 过滤；/logs/system 必填 dto.OperationWithName = { name }，
 *    name 是 /logs/system/files 返回的日志文件名（当天为 "YYYY-MM-DD"），
 *    所以 listSystem() 先取文件列表再拉默认那天的日志。
 *  - /logs/system 的响应 data 是日志全文（纯文本），base.ts 对非 JSON 会原样返回。
 */
export class LogsAPI extends BaseAPI {
  /** 操作日志分页（v1: POST /logs/operation） */
  async listOperation(filters?: { operation?: string; source?: string; status?: string; page?: number; pageSize?: number }): Promise<any> {
    return this.post("/api/v1/logs/operation", {
      page: filters?.page ?? 1,
      pageSize: filters?.pageSize ?? 100,
      ...(filters?.operation ? { operation: filters.operation } : {}),
      ...(filters?.source ? { source: filters.source } : {}),
      ...(filters?.status ? { status: filters.status } : {}),
    });
  }

  /** 系统日志（v1: GET /logs/system/files 取文件名 → POST /logs/system { name }） */
  async listSystem(name?: string): Promise<any> {
    if (name) {
      return this.post("/api/v1/logs/system", { name });
    }
    // 未指定时取最新一个日志文件（/logs/system/files 按时间倒序，当天为 YYYY-MM-DD）
    const files = await this.get("/api/v1/logs/system/files");
    const list: string[] = Array.isArray(files?.data) ? files.data : [];
    // 兜底用本机当天日期（后端按面板本地时区把 "YYYY-MM-DD" 映射成 1Panel.log）
    const latest = list[0] ?? new Date().toLocaleDateString("sv-SE");
    return this.post("/api/v1/logs/system", { name: latest });
  }

  /** 可用系统日志文件列表（v1: GET /logs/system/files） */
  async listSystemFiles(): Promise<any> {
    return this.get("/api/v1/logs/system/files");
  }

  /** 清空日志（v1: POST /logs/clean，dto.CleanLog = { logType }，logType ∈ operation|login|system） */
  async clean(logType: "operation" | "login" | "system" = "operation"): Promise<any> {
    return this.post("/api/v1/logs/clean", { logType });
  }

  /** 登录日志分页（v1: POST /logs/login，dto.SearchLgLogWithPage = { page, pageSize }） */
  async listLogin(page = 1, pageSize = 100): Promise<any> {
    return this.post("/api/v1/logs/login", { page, pageSize });
  }
}
