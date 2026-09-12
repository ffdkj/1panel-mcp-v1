import { BaseAPI } from "./base.js";

export interface FTPCreateRequest {
  /** 用户名（v2 字段名；v1 的 DTO 字段是 user，这里做映射） */
  userName?: string;
  /** v1 原生字段名，与 userName 二选一 */
  user?: string;
  /** 密码（明文；v1 要求客户端先做 base64，由本模块负责编码） */
  password: string;
  /** 根目录（v1 会确保目录存在，不存在则创建） */
  path: string;
  /** 描述 */
  description?: string;
}

export interface FTPUpdateRequest {
  /** 用户ID */
  id: number;
  /** 密码（明文；v1 必填并做 base64 解码，本模块负责编码） */
  password?: string;
  /** 根目录（v1 必填） */
  path?: string;
  /** 描述 */
  description?: string;
  /** 状态（Enable/Disable），v1 DTO 里有该字段 */
  status?: string;
}

export interface FTPDeleteRequest {
  /** 用户ID */
  id: number;
}

/**
 * v1 的 FTP 密码走 base64 传输：后端 CreateFtp/UpdateFtp 会 base64 解码后再入库
 * （v1 前端也是 Base64.encode(password) 后再提交）。
 * 直接发明文会被后端判定为「非法参数」，请统一走这里编码。
 */
function encodePassword(password: string): string {
  return Buffer.from(password, "utf8").toString("base64");
}

export class FTPAPI extends BaseAPI {
  /**
   * 列出 FTP 用户
   */
  async list(): Promise<any> {
    return this.post("/api/v1/toolbox/ftp/search", { page: 1, pageSize: 100 });
  }

  /**
   * 获取 FTP 基础信息
   */
  async getBaseInfo(): Promise<any> {
    return this.request("/api/v1/toolbox/ftp/base", { method: "GET" });
  }

  /**
   * 创建 FTP 用户。
   * v1 的字段是 user（不是 v2 的 userName），password 需要 base64。
   */
  async create(params: FTPCreateRequest): Promise<any> {
    const user = params.user ?? params.userName;
    if (!user || !params.password || !params.path) {
      throw new Error("1Panel v1 创建 FTP 用户要求 user（userName）、password、path 三个字段都非空");
    }
    return this.post("/api/v1/toolbox/ftp", {
      user,
      password: encodePassword(params.password),
      path: params.path,
      description: params.description ?? "",
    });
  }

  /**
   * 更新 FTP 用户。
   * v1 的 dto.FtpUpdate 把 password 和 path 标为必填（password 还要 base64），
   * 且后端会用 password 与服务端现有密码比对、用 path 覆盖原目录，
   * 所以缺任何一个都会 400；这里提前抛错，避免半个表单打过去。
   *
   * 另外 v1 的 update 是全量覆盖：未传 description 会被写成空串，
   * 只想改描述时请先 list() 取回完整的 password/path/description 再提交。
   */
  async update(params: FTPUpdateRequest): Promise<any> {
    if (!params.password || !params.path) {
      throw new Error(
        "1Panel v1 的 /toolbox/ftp/update 要求 password 与 path 必填（password 走 base64）；" +
          "可先调用 list() 取回当前用户的 path/password 后补齐再更新",
      );
    }
    return this.post("/api/v1/toolbox/ftp/update", {
      id: params.id,
      password: encodePassword(params.password),
      path: params.path,
      description: params.description ?? "",
      status: params.status ?? "",
    });
  }

  /**
   * 删除 FTP 用户。
   * v1 是批量删除：body 为 { ids: number[] }（不是 v2 的 { id }）。
   */
  async remove(id: number): Promise<any> {
    return this.post("/api/v1/toolbox/ftp/del", { ids: [id] });
  }

  /**
   * 操作 FTP (启动/停止/重启)，v1 支持 start/stop/restart。
   */
  async operate(operation: "start" | "stop" | "restart"): Promise<any> {
    return this.post("/api/v1/toolbox/ftp/operate", { operation });
  }

  /**
   * 同步 FTP 用户。
   * 注意 swagger 上标注的 body（dto.BatchDeleteReq）是过期注解：v1 的 SyncFtp 处理器
   * 不绑定任何请求体，直接按服务端 pureftpd.passwd 与数据库做双向同步，因此传空对象即可。
   */
  async sync(): Promise<any> {
    return this.post("/api/v1/toolbox/ftp/sync", {});
  }

  /**
   * 获取 FTP 操作日志。
   * v1 是 POST /toolbox/ftp/log/search（分页查询），不是 v2 的 GET /toolbox/ftp/log。
   */
  async getLogs(): Promise<any> {
    return this.post("/api/v1/toolbox/ftp/log/search", { page: 1, pageSize: 100 });
  }
}
