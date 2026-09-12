import { BaseAPI } from "./base.js";

/**
 * 1Panel v1.x 网站 API 适配层
 *
 * 与原 v2 实现的语义差异（不是改前缀就能解决的）：
 *  - 域名：v1 request.WebsiteDomainCreate 的 domains 是**字符串**（面板表单就一个文本框），v2 是数组；
 *    v1 也没有 /websites/domains/update（只有 create / del / 按网站查询）。
 *  - 证书删除：v1 是批量 { ids: number[] }（request.WebsiteBatchDelReq），v2 是 { id }。
 *  - 申请/续签：v1 只有 POST /websites/ssl/obtain（request.WebsiteSSLApply 只认 ID），
 *    没有独立的 /websites/ssl/renew，也没有 /websites/ssl/apply。
 *  - HTTPS：v1 是 POST /websites/{id}/https（request.WebsiteHTTPSOp），没有 hstsIncludeSubDomains/http3/httpsPorts。
 *  - Nginx：v1 取站点 nginx 配置是 GET /websites/{id}/config/openresty，写是 POST /websites/nginx/update { id, content }。
 *  - 防盗链：v1 取配置是 POST /websites/leech { websiteID }（v2 是 GET），必填 extends/return。
 */

// ==================== Domain ====================

export interface DomainCreateRequest {
  /** 网站ID（v1 的 DTO 字段名是 websiteID，方法内部会改名） */
  websiteId: number;
  /** 域名；v1 只接收字符串（多个域名用逗号分隔），传数组时本方法会拼成字符串 */
  domain: string | string[];
  /** 端口；v1 的创建 DTO 没有 port 字段，给定时会拼成 "host:port"（v1 面板同样只能把端口写在域名里） */
  port?: number;
}

export interface DomainDeleteRequest {
  /** 域名ID */
  id: number;
}

export interface DomainUpdateRequest {
  /** 域名ID */
  id: number;
  /** 网站ID */
  websiteId: number;
  /** 域名 */
  domain?: string;
  /** 端口 */
  port?: number;
}

// ==================== SSL ====================

export interface SSLObtainRequest {
  /** SSL 记录 ID（v1 request.WebsiteSSLApply 必填字段就是 ID） */
  ID: number;
  /**
   * 以下字段 v1 的申请接口都不接收：域名/密钥类型/有效期在创建或更新证书记录
   * （POST /websites/ssl、/websites/ssl/update）时就已写进记录，申请时只按 ID 执行。
   */
  domains?: string[];
  keyType?: string;
  time?: number;
  unit?: string;
  autoRenew?: boolean;
  /** v1 支持的可选字段，给了就透传 */
  nameservers?: string[];
  skipDNSCheck?: boolean;
  disableLog?: boolean;
}

export interface SSLRenewRequest {
  /** SSL 记录 ID */
  ID: number;
}

export interface SSLApplyRequest {
  /** 网站ID（v1 请求体与路径都需要） */
  websiteId: number;
  /** SSL ID */
  websiteSSLId?: number;
  /** 证书类型: existed, auto, manual */
  type: "existed" | "auto" | "manual";
  /** 是否启用 HTTPS */
  enable: boolean;
  /** HTTP 配置: HTTPSOnly, HTTPAlso, HTTPToHTTPS */
  httpConfig?: "HTTPSOnly" | "HTTPAlso" | "HTTPToHTTPS";
  /** 私钥 */
  privateKey?: string;
  /** 证书 */
  certificate?: string;
  /** 算法 */
  algorithm?: string;
  /** HSTS */
  hsts?: boolean;
  /** v1 不支持（request.WebsiteHTTPSOp 里没有这三个字段，只有响应里才带） */
  hstsIncludeSubDomains?: boolean;
  http3?: boolean;
  httpsPorts?: number[];
}

// ==================== HTTPS ====================

export interface HTTPSGetRequest {
  /** 网站ID */
  id: number;
}

// ==================== Nginx ====================

export interface NginxUpdateRequest {
  /** 网站ID */
  id: number;
  /** 配置内容 */
  content: string;
}

/** v1 的域名创建只收字符串，这里把 v2 的数组/对象形式归一成字符串 */
function normalizeDomains(domain: string | string[], port?: number): string {
  const list = (Array.isArray(domain) ? domain : [domain])
    .map((item) => String(item ?? "").trim())
    .filter((item) => item.length > 0);
  if (list.length === 0) {
    throw new Error("创建网站域名需要 domain（v1 的字段名是 domains，字符串或多域名逗号分隔）");
  }
  if (port === undefined) {
    return list.join(",");
  }
  // v1 的 DomainCreate 没有 port 字段，端口只能写在域名里
  return list.map((item) => (item.includes(":") ? item : `${item}:${port}`)).join(",");
}

export class WebsiteAPI extends BaseAPI {
  // ==================== Website ====================

  /**
   * 列出网站（v1: GET /websites/list，返回全部站点的简要列表）
   */
  async list(): Promise<any> {
    return this.get("/api/v1/websites/list");
  }

  /**
   * 创建网站
   * v1 request.WebsiteCreate 必填 alias / primaryDomain / type / webSiteGroupID，
   * 站点类型（type）与分组（webSiteGroupID）由调用方给出，这里原样透传。
   */
  async create(site: any): Promise<any> {
    return this.post("/api/v1/websites", site);
  }

  /**
   * 获取网站详情（v1: GET /websites/{id}）
   */
  async getDetail(id: number): Promise<any> {
    return this.get(`/api/v1/websites/${id}`);
  }

  /**
   * 删除网站
   * v1 request.WebsiteDelete 只需 id，deleteApp/deleteBackup/forceDelete 可选（默认不删应用与备份）。
   */
  async remove(id: number): Promise<any> {
    return this.post("/api/v1/websites/del", { id });
  }

  /**
   * 更新网站
   * v1 request.WebsiteUpdate 必填 id + primaryDomain（v1 只能改主域名/备注/分组/到期时间，改不了域名列表）。
   */
  async update(site: any): Promise<any> {
    return this.post("/api/v1/websites/update", site);
  }

  // ==================== Domain ====================

  /**
   * 获取网站域名列表（v1: GET /websites/domains/{websiteId}）
   */
  async listDomains(websiteId: number): Promise<any> {
    return this.get(`/api/v1/websites/domains/${websiteId}`);
  }

  /**
   * 添加域名
   * v1 request.WebsiteDomainCreate = { websiteID, domains: string }：
   * 字段名是 websiteID，domains 是字符串（多域名逗号分隔）——这两个都和 v2 不同。
   */
  async createDomain(params: DomainCreateRequest): Promise<any> {
    if (!params?.websiteId) {
      throw new Error("添加网站域名需要 websiteId（v1 的字段名是 websiteID）");
    }
    return this.post("/api/v1/websites/domains", {
      websiteID: params.websiteId,
      domains: normalizeDomains(params.domain, params.port),
    });
  }

  /**
   * 删除域名（v1 request.WebsiteDomainDelete = { id }，与 v2 一致）
   */
  async deleteDomain(params: DomainDeleteRequest): Promise<any> {
    return this.post("/api/v1/websites/domains/del", { id: params?.id });
  }

  /**
   * 更新域名
   * 1Panel v1 不支持该接口（v2 专有）: /websites/domains/update
   * v1 的 Website Domain 只有 create / del / 按 websiteId 查询三个路由，
   * 且 v1 的“域名更新”语义只是改 ssl 开关（request.WebsiteDomainUpdate = { id, ssl }），
   * 无法表达 v2 的 domain/port 修改。v1 原生做法是「先删后建」：
   *   deleteDomain({ id }) → createDomain({ websiteId, domain })。
   */
  async updateDomain(params: DomainUpdateRequest): Promise<any> {
    throw new Error(
      "1Panel v1 不支持该接口（v2 专有）: /websites/domains/update；" +
        `v1 里请改用 deleteDomain({ id: ${params?.id} }) + createDomain({ websiteId: ${params?.websiteId}, domain })`,
    );
  }

  // ==================== SSL ====================

  /**
   * 列出 SSL 证书
   * v1 request.WebsiteSSLSearch 要求 page/pageSize；PageInfo 为空时后端会退化成全量查询。
   */
  async listCertificates(): Promise<any> {
    return this.post("/api/v1/websites/ssl/search", { page: 1, pageSize: 100 });
  }

  /**
   * 获取 SSL 证书详情（v1: GET /websites/ssl/{id}）
   */
  async getCertificate(id: number): Promise<any> {
    return this.get(`/api/v1/websites/ssl/${id}`);
  }

  /**
   * 创建 SSL 证书记录
   * v1 request.WebsiteSSLCreate 必填 acmeAccountId / primaryDomain / provider（+ apply 表示创建后立即申请）；
   * 粘贴已有证书请用 uploadSSL（v1 是两个不同的入口）。
   */
  async createCertificate(cert: any): Promise<any> {
    return this.post("/api/v1/websites/ssl", cert);
  }

  /**
   * 删除 SSL 证书
   * v1 是批量删除 request.WebsiteBatchDelReq = { ids: number[] }（v2 是 { id }）。
   */
  async deleteCertificate(id: number): Promise<any> {
    return this.post("/api/v1/websites/ssl/del", { ids: [id] });
  }

  /**
   * 申请 SSL 证书
   * v1 没有 /websites/ssl/obtain 之外的申请入口：POST /websites/ssl/obtain 接收
   * request.WebsiteSSLApply = { ID, disableLog?, nameservers?, skipDNSCheck? }，
   * 域名/密钥类型/有效期来自证书记录本身（POST /websites/ssl 时写入），
   * 所以这里丢弃 v2 的 domains/keyType/time/unit/autoRenew，只按 ID 申请。
   */
  async obtainSSL(params: SSLObtainRequest): Promise<any> {
    if (!params?.ID) {
      throw new Error("申请证书需要 ID（v1 request.WebsiteSSLApply 必填字段）");
    }
    const body: any = { ID: params.ID };
    if (params.disableLog !== undefined) body.disableLog = params.disableLog;
    if (params.nameservers !== undefined) body.nameservers = params.nameservers;
    if (params.skipDNSCheck !== undefined) body.skipDNSCheck = params.skipDNSCheck;
    return this.post("/api/v1/websites/ssl/obtain", body);
  }

  /**
   * 续签 SSL 证书
   * v1 没有独立的续签路由（v2 专有: /websites/ssl/renew），
   * Website SSL 的重新签发就是 POST /websites/ssl/obtain（内部 ObtainSSL 会重新走 ACME 签发流程），
   * 因此与 obtainSSL 落到同一个端点，语义一致。
   */
  async renewSSL(params: SSLRenewRequest): Promise<any> {
    if (!params?.ID) {
      throw new Error("续签证书需要 ID（v1 走 /websites/ssl/obtain）");
    }
    return this.post("/api/v1/websites/ssl/obtain", { ID: params.ID });
  }

  /**
   * 解析 SSL 证书（DNS 验证记录）
   * v1 request.WebsiteDNSReq = { acmeAccountId, domains: string[] }，与 v2 的 { websiteSSLId } 不同：
   * 先用 websiteSSLId 取回证书记录，再拿它的 acmeAccountId 与域名去解析。
   */
  async resolveSSL(params: { websiteSSLId: number }): Promise<any> {
    if (!params?.websiteSSLId) {
      throw new Error("解析证书需要 websiteSSLId（v1 内部会用它反查 acmeAccountId 与域名）");
    }
    const ssl = await this.getCertificate(params.websiteSSLId);
    const record = ssl?.data ?? {};
    const domains = String(record.domains ?? record.primaryDomain ?? "")
      .split(",")
      .map((item: string) => item.trim())
      .filter((item: string) => item.length > 0);
    if (!record.acmeAccountId || domains.length === 0) {
      throw new Error(
        `1Panel v1 解析证书需要 acmeAccountId 与 domains，证书 ${params.websiteSSLId} 上取不到（可能是本地上传证书，无 ACME 账号）`,
      );
    }
    return this.post("/api/v1/websites/ssl/resolve", { acmeAccountId: record.acmeAccountId, domains });
  }

  /**
   * 上传 SSL 证书
   * v1 request.WebsiteSSLUpload 必填 type（paste=粘贴内容 / local=服务器路径），
   * 工具层可能传 { cert: {...} }，这里做一次拆包并补默认 type。
   */
  async uploadSSL(params: any): Promise<any> {
    const cert = params?.cert ?? params ?? {};
    const type = cert.type ?? (cert.certificate || cert.privateKey ? "paste" : "local");
    const body: any = { type };
    if (cert.certificate !== undefined) body.certificate = cert.certificate;
    if (cert.privateKey !== undefined) body.privateKey = cert.privateKey;
    if (cert.certificatePath !== undefined) body.certificatePath = cert.certificatePath;
    if (cert.privateKeyPath !== undefined) body.privateKeyPath = cert.privateKeyPath;
    if (cert.sslID !== undefined) body.sslID = cert.sslID;
    if (cert.description !== undefined) body.description = cert.description;
    return this.post("/api/v1/websites/ssl/upload", body);
  }

  /**
   * 获取网站绑定的 SSL 证书（v1: GET /websites/ssl/website/{websiteId}）
   */
  async getWebsiteSSL(websiteId: number): Promise<any> {
    return this.get(`/api/v1/websites/ssl/website/${websiteId}`);
  }

  // ==================== HTTPS ====================

  /**
   * 获取 HTTPS 配置（v1: GET /websites/{id}/https）
   */
  async getHTTPS(id: number): Promise<any> {
    return this.get(`/api/v1/websites/${id}/https`);
  }

  /**
   * 更新 HTTPS 配置（v1: POST /websites/{id}/https）
   * v1 request.WebsiteHTTPSOp 只有 websiteId 必填，
   * 可选：type / enable / httpConfig / websiteSSLId / privateKey / certificate / algorithm / hsts
   * （SSLProtocol[] 在 v1 请求体里也有，但本模块的入参结构没有这个字段）。
   */
  async updateHTTPS(params: SSLApplyRequest): Promise<any> {
    if (!params?.websiteId) {
      throw new Error("更新 HTTPS 配置需要 websiteId（v1 的路径与请求体都要）");
    }
    const body: any = { websiteId: params.websiteId };
    if (params.type !== undefined) body.type = params.type;
    if (params.enable !== undefined) body.enable = params.enable;
    if (params.httpConfig !== undefined) body.httpConfig = params.httpConfig;
    if (params.websiteSSLId !== undefined) body.websiteSSLId = params.websiteSSLId;
    if (params.privateKey !== undefined) body.privateKey = params.privateKey;
    if (params.certificate !== undefined) body.certificate = params.certificate;
    if (params.algorithm !== undefined) body.algorithm = params.algorithm;
    if (params.hsts !== undefined) body.hsts = params.hsts;
    // v2 的 hstsIncludeSubDomains / http3 / httpsPorts 在 v1 的 request.WebsiteHTTPSOp 里不存在，直接丢弃
    return this.post(`/api/v1/websites/${params.websiteId}/https`, body);
  }

  /**
   * 应用 SSL 到网站
   * v1 没有 /websites/ssl/apply（v2 专有）；把证书应用到网站 = 更新该网站的 HTTPS 配置，
   * 即 POST /websites/{id}/https，因此直接复用 updateHTTPS。
   */
  async applySSL(params: SSLApplyRequest): Promise<any> {
    return this.updateHTTPS(params);
  }

  // ==================== Nginx ====================

  /**
   * 获取网站 nginx 配置
   * v1 是 GET /websites/{id}/config/{type}，面板用的 type 就是 "openresty"（站点自身的 nginx 配置文件），
   * 不是 v2 的 GET /websites/nginx/{id}。
   */
  async getNginxConf(id: number): Promise<any> {
    return this.get(`/api/v1/websites/${id}/config/openresty`);
  }

  /**
   * 更新网站 nginx 配置
   * v1 request.WebsiteNginxUpdate = { id, content }（两个都必填），与 v2 字段一致。
   */
  async updateNginxConf(params: NginxUpdateRequest): Promise<any> {
    return this.post("/api/v1/websites/nginx/update", { id: params?.id, content: params?.content });
  }

  // ==================== AntiLeech (XPack) ====================

  /**
   * 获取防盗链配置
   * v1 是 POST /websites/leech + request.NginxCommonReq { websiteID }（v2 是 GET 带 id），字段名是 websiteID。
   */
  async getAntiLeechConf(websiteId: number): Promise<any> {
    return this.post("/api/v1/websites/leech", { websiteID: websiteId });
  }

  /**
   * 更新防盗链配置
   * v1 request.NginxAntiLeechUpdate 必填 extends（扩展名列表）+ return（拦截返回码）+ websiteID，
   * 缺字段后端会 400，这里提前抛错并提示先读一次配置。
   */
  async updateAntiLeech(params: any): Promise<any> {
    const p = params ?? {};
    if (p.extends === undefined || p.return === undefined) {
      throw new Error(
        "1Panel v1 的 /websites/leech/update 要求 extends（防盗链扩展名）与 return（拦截返回码）必填；" +
          "可先调用 getAntiLeechConf(websiteId) 取回当前配置补齐后再更新",
      );
    }
    return this.post("/api/v1/websites/leech/update", {
      ...p,
      websiteID: p.websiteID ?? p.websiteId,
    });
  }
}
