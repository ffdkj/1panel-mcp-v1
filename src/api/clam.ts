import { BaseAPI } from "./base.js";

export interface ClamCreateRequest {
  /** 名称（v1 用它做唯一键，重复会报已存在） */
  name: string;
  /** 扫描路径 */
  path: string;
  /** 描述 */
  description?: string;
  /** 感染文件处理策略：none | remove | move | copy（v1 ClamCreate 字段） */
  infectedStrategy?: string;
  /** move/copy 策略下的隔离目录 */
  infectedDir?: string;
  /** 定时表达式（cron spec，留空则只支持手动扫描） */
  spec?: string;
  /** 告警阈值/标题（XPack） */
  alertCount?: number;
  alertTitle?: string;
}

export interface ClamUpdateRequest {
  /** ID */
  id: number;
  /** 名称：v1 的 /toolbox/clam/update 先按 name 查记录、再按 id 更新，因此必填 */
  name?: string;
  /** 扫描路径 */
  path?: string;
  /** 描述 */
  description?: string;
  /** 感染文件处理策略：none | remove | move | copy */
  infectedStrategy?: string;
  /** move/copy 策略下的隔离目录 */
  infectedDir?: string;
  /** 定时表达式（cron spec） */
  spec?: string;
  alertCount?: number;
  alertTitle?: string;
}

/** v1 /toolbox/clam/file/search 与 /file/update 认的配置文件名 */
export type ClamFileName = "clamd" | "clamd-log" | "freshclam" | "freshclam-log";

/**
 * 1Panel v1.x ClamAV API 适配层
 *
 * 与原 v2 实现的语义差异（v2 的 /toolbox/clam/file、/toolbox/clam/scan、/toolbox/clam/status 在 v1 不存在）：
 *  - 基础信息：v1 的 /toolbox/clam/base 注册为 **POST**（swagger 注解写的是 GET，是过期注解；
 *    用 GET 会命中 1Panel 的 NoRoute 兜底，返回安全入口的 HTML 守卫页）。这里改用 POST。
 *  - 配置文件：v1 是 POST /toolbox/clam/file/search（body 必须带 name）读取、
 *    POST /toolbox/clam/file/update（body { name, file }）保存；没有 v2 的 /toolbox/clam/file。
 *  - 立即扫描：v1 是 POST /toolbox/clam/handle（body { id }），没有 /toolbox/clam/scan。
 *  - 状态开关：v1 是 POST /toolbox/clam/status/update（body { id, status }），没有 /toolbox/clam/status，
 *    且必须带 id —— v1 的 status 是「单条扫描规则的启用/停用」，不是全局开关。
 *  - 列表：v1 /toolbox/clam/search 必填 order + orderBy（枚举里表示不排序的字面量就是 "null"）。
 */
export class ClamAPI extends BaseAPI {
  /**
   * 列出 ClamAV 扫描规则（v1 必填 order/orderBy）
   */
  async list(): Promise<any> {
    return this.post("/api/v1/toolbox/clam/search", {
      page: 1,
      pageSize: 100,
      orderBy: "created_at",
      order: "null",
    });
  }

  /**
   * 获取 ClamAV 基础信息。
   * 注意：v1 该端点注册为 POST（GET 会拿到 HTML 守卫页），故不使用 GET。
   */
  async getBaseInfo(): Promise<any> {
    return this.post("/api/v1/toolbox/clam/base", {});
  }

  /**
   * 创建 ClamAV 扫描规则（v1 字段名与 v2 一致：name/path/description/infectedStrategy/infectedDir/spec/alertCount/alertTitle）
   */
  async create(params: ClamCreateRequest): Promise<any> {
    return this.post("/api/v1/toolbox/clam", {
      name: params.name,
      path: params.path,
      description: params.description ?? "",
      infectedStrategy: params.infectedStrategy ?? "",
      infectedDir: params.infectedDir ?? "",
      spec: params.spec ?? "",
      alertCount: params.alertCount ?? 0,
      alertTitle: params.alertTitle ?? "",
    });
  }

  /**
   * 更新 ClamAV 扫描规则。
   * v1 后端先按 name 查现有记录、再按 id 更新，name 缺失会直接报「记录不存在」，故这里提前抛错。
   *
   * 注意 v1 的 update 是**全量覆盖**：path/infectedStrategy/infectedDir/spec/description 都会被
   * 本次请求的值直接写库，没传的按空值处理（尤其是 spec 被清空会连带停掉该规则的定时扫描）。
   * 只想改个别字段时，建议先 list() 取回完整记录再改。
   */
  async update(params: ClamUpdateRequest): Promise<any> {
    if (!params.name) {
      throw new Error(
        "1Panel v1 的 /toolbox/clam/update 需要 name（后端先用 name 定位记录、再用 id 更新）；" +
          "可先调用 list() 按 id 取回 name 后重试",
      );
    }
    return this.post("/api/v1/toolbox/clam/update", {
      id: params.id,
      name: params.name,
      path: params.path ?? "",
      description: params.description ?? "",
      infectedStrategy: params.infectedStrategy ?? "none",
      infectedDir: params.infectedDir ?? "",
      spec: params.spec ?? "",
      alertCount: params.alertCount ?? 0,
      alertTitle: params.alertTitle ?? "",
    });
  }

  /**
   * 删除 ClamAV 扫描规则。
   * v1 是批量删除 { ids: number[] }，不是 v2 的 { id }；removeRecord/removeInfected 默认 false
   * （即保留扫描报告与隔离文件）。
   */
  async remove(id: number): Promise<any> {
    return this.post("/api/v1/toolbox/clam/del", { ids: [id], removeRecord: false, removeInfected: false });
  }

  /**
   * 获取 ClamAV 配置文件内容。
   * v1 是 POST /toolbox/clam/file/search + { name }（不是 v2 的无参 GET /toolbox/clam/file）。
   * 工具层没有提供文件名，这里默认取主配置 clamd；tail 传空串表示返回完整文件。
   */
  async getFile(name: ClamFileName = "clamd"): Promise<any> {
    return this.post("/api/v1/toolbox/clam/file/search", { name, tail: "" });
  }

  /**
   * 保存 ClamAV 配置文件。
   * v1 是 POST /toolbox/clam/file/update + { name, file }（v2 的 { content } 字段名不对）。
   */
  async updateFile(content: string, name: ClamFileName = "clamd"): Promise<any> {
    return this.post("/api/v1/toolbox/clam/file/update", { name, file: content });
  }

  /**
   * 执行 ClamAV 扫描。
   * v1 是 POST /toolbox/clam/handle + { id }（没有 /toolbox/clam/scan）：立即对指定规则跑一次 clamdscan。
   */
  async scan(id: number): Promise<any> {
    return this.post("/api/v1/toolbox/clam/handle", { id });
  }

  /**
   * 获取 ClamAV 扫描记录。
   * v1 的 /toolbox/clam/record/search 必须带 clamID（少了会报记录不存在），
   * 且后端用 startTime < 记录时间 < endTime 过滤，时间范围不传则一条都返回不了，
   * 因此这里默认给一个足够宽的时间窗。
   */
  async getRecords(clamID?: number): Promise<any> {
    if (clamID === undefined || clamID === null) {
      throw new Error(
        "1Panel v1 的 /toolbox/clam/record/search 需要 clamID（按扫描规则查记录）；" +
          "请先调用 list() 取得规则 id 后传入，例如 getRecords(id)",
      );
    }
    return this.post("/api/v1/toolbox/clam/record/search", {
      page: 1,
      pageSize: 100,
      clamID,
      startTime: "1970-01-01T00:00:00Z",
      endTime: new Date().toISOString(),
    });
  }

  /**
   * 清理 ClamAV 扫描记录。
   * v1 的 /toolbox/clam/record/clean 需要 id（清空该规则名下的扫描报告目录），不是无参调用。
   */
  async cleanRecords(id?: number): Promise<any> {
    if (id === undefined || id === null) {
      throw new Error(
        "1Panel v1 的 /toolbox/clam/record/clean 需要 id（按扫描规则清空报告）；" +
          "请先调用 list() 取得规则 id 后传入，例如 cleanRecords(id)",
      );
    }
    return this.post("/api/v1/toolbox/clam/record/clean", { id });
  }

  /**
   * 更新 ClamAV 扫描规则状态（Enable/Disable）。
   * v1 的 /toolbox/clam/status/update 需要 { id, status }，作用对象是单条规则（会启停它的定时任务），
   * 不是全局开关；全局启停请用 /toolbox/clam/operate。
   */
  async updateStatus(status: string, id?: number): Promise<any> {
    if (id === undefined || id === null) {
      throw new Error(
        "1Panel v1 的 /toolbox/clam/status/update 需要 id（作用是单条扫描规则的启用/停用，status 取 Enable/Disable）；" +
          "请先调用 list() 取得规则 id 后传入，例如 updateStatus(status, id)；整个 ClamAV 服务的启停不属于该端点",
      );
    }
    return this.post("/api/v1/toolbox/clam/status/update", { id, status });
  }
}
