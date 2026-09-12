import { BaseAPI } from "./base.js";

export interface BackupAccountCreateRequest {
  /** 类型: LOCAL, OSS, S3, COS, KODO, MINIO, SFTP, WebDAV */
  type: "LOCAL" | "OSS" | "S3" | "COS" | "KODO" | "MINIO" | "SFTP" | "WebDAV";
  /** 名称（v1 的备份账号没有 name 字段，一种类型只允许一个账号，此字段仅为兼容 v2 签名保留） */
  name: string;
  /** 配置信息（v1 收 JSON 字符串，这里会给对象做序列化） */
  vars: Record<string, string>;
  /** 是否默认（v1 不支持该概念） */
  isDefault?: boolean;
}

export interface BackupAccountUpdateRequest {
  /** 类型 */
  type: string;
  /** 名称（v1 无此字段，保留以兼容 v2 签名） */
  name: string;
  /** 配置信息（v1 收 JSON 字符串） */
  vars: Record<string, string>;
  /** 是否默认（v1 不支持该概念） */
  isDefault?: boolean;
  /** v1 备份账号 id（v1 的 update 必填 id；缺省时按 type 从列表反查） */
  id?: number;
}

export interface BackupAccountDeleteRequest {
  /** 类型 */
  type: string;
  /** 名称（v1 无此字段，保留以兼容 v2 签名） */
  name?: string;
  /** v1 备份账号 id（v1 的 del 必填 id；缺省时按 type 从列表反查） */
  id?: number;
}

/**
 * 1Panel v1.x 备份账号 API 适配层
 *
 * v2 的 /core/backups/* 全部对应到 v1 的 /settings/backup/*，但字段和语义差别较大：
 *  - 列表：v1 只注册了 GET /settings/backup/search（无分页）；POST 同名路径未开放给 API（实测守卫页）。
 *  - 详情/选项：v1 没有 options、也没有 client/{clientType} 端点（各类型的表单字段由前端按类型硬编码），
 *    对应方法只能抛错，见方法注释。
 *  - 新建/更新：v1 的 dto.BackupOperate 是 { id, type, bucket, accessKey, credential, backupPath, vars }，
 *    其中 vars 是 JSON **字符串**；没有 name / isDefault（v1 按 type 唯一，一种类型一个账号）。
 *  - 删除：v1 /settings/backup/del 的 body 是 dto.OperateByID { id }，这里会按 type/id 反查账号 id。
 *  - 列文件：v1 是 POST /settings/backup/search/files { type }（按**账号类型**查询，不是按账号 id）。
 */
export class BackupAccountAPI extends BaseAPI {
  /**
   * 列出备份账号
   * v1：GET /settings/backup/search（返回数组 [{ id, createdAt, type, bucket, backupPath, vars }]）
   */
  async list(): Promise<any> {
    return this.get("/api/v1/settings/backup/search");
  }

  /**
   * 获取备份账号选项
   *
   * v2 的 GET /core/backups/options 返回可选账号类型列表；v1 没有该端点
   * （v1 前端把类型清单和各类型的 vars 模板硬编码在每个类型的表单视图里）。
   * v1 面板实际支持的类型：LOCAL / OSS / S3 / COS / KODO / MINIO / SFTP / WebDAV / OneDrive。
   */
  async getOptions(): Promise<any> {
    throw new Error(
      "1Panel v1 不存在该接口（v2 专有）: GET /core/backups/options。" +
        "v1 的备份账号类型为 LOCAL/OSS/S3/COS/KODO/MINIO/SFTP/WebDAV/OneDrive，各类型字段由前端硬编码。",
    );
  }

  /**
   * 获取备份账号基础信息
   *
   * v2 的 GET /core/backups/client/{clientType} 返回该类型需要的 vars 模板；v1 没有该端点。
   */
  async getClientInfo(clientType: string): Promise<any> {
    throw new Error(
      `1Panel v1 不存在该接口（v2 专有）: GET /core/backups/client/${clientType}。` +
        "v1 各备份类型（LOCAL/OSS/S3/COS/KODO/MINIO/SFTP/WebDAV/OneDrive）的配置字段由前端硬编码，需人工提供 vars。",
    );
  }

  /**
   * 创建备份账号
   * v1：POST /settings/backup，body { type, vars(JSON 字符串), bucket, accessKey, credential, backupPath }
   */
  async create(params: BackupAccountCreateRequest): Promise<any> {
    // v1 无 name / isDefault 字段，不发送（v1 里 type 即账号唯一标识）
    return this.post("/api/v1/settings/backup", {
      type: params.type,
      vars: JSON.stringify(params.vars ?? {}),
    });
  }

  /**
   * 更新备份账号
   * v1：POST /settings/backup/update，body 与创建相同但必须带 id
   */
  async update(params: BackupAccountUpdateRequest): Promise<any> {
    const id = params.id ?? (await this.findAccountIdByType(params.type));
    if (!id) {
      throw new Error(`1Panel v1 找不到类型为 ${params.type} 的备份账号，无法更新（可先用 list_backup_accounts 查看）`);
    }
    return this.post("/api/v1/settings/backup/update", {
      id,
      type: params.type,
      vars: JSON.stringify(params.vars ?? {}),
    });
  }

  /**
   * 删除备份账号
   * v1：POST /settings/backup/del { id }（id 靠 type/id 反查得到）
   */
  async delete(params: BackupAccountDeleteRequest): Promise<any> {
    const id = params.id ?? (await this.findAccountIdByType(params.type));
    if (!id) {
      throw new Error(`1Panel v1 找不到类型为 ${params.type} 的备份账号，无法删除（可先用 list_backup_accounts 查看）`);
    }
    return this.post("/api/v1/settings/backup/del", { id });
  }

  /**
   * 检查备份账号连通性
   *
   * v2 的 POST /core/backups/check 在 v1 不存在，但 v1 有语义等价的接口
   * **POST /settings/backup/buckets**，这正是 v1 面板「检查」按钮背后的调用：
   *
   *   dto.ForBuckets{ Type, AccessKey, Credential, Vars }
   *   → service.GetBuckets() 把 accessKey/secretKey（或 username/password）
   *     合并进 vars，再用云存储客户端 ListBuckets()
   *   → 能列出 bucket 就说明凭据可用，因此"列出 bucket"就是 v1 的连通性检查
   *
   * 关键细节（据 v1 `backend/app/api/v1/backup.go` + `app/service/backup.go`）：
   *  - `Credential` 带 `validate:"required"`，**不接受空串**，且服务端会做 base64 解码
   *    （空串能过 required 但会被当成有效值，实测传非 4 倍数长度的明文会报 illegal base64）。
   *  - 各存储类型的凭据字段名：S3/OSS/MinIO/COS/Kodo → accessKey + secretKey；
   *    SFTP/WebDAV → username + password。本方法会自动从 `vars` 里取这两个字段。
   *  - LOCAL 类型没有 bucket 概念，v1 面板也不提供检查，故直接给出说明性错误。
   *
   * 该路径未登记在权威 swagger 里（swagger 把同一个 handler 错记成了
   * POST /settings/backup/search，而那条注解的 summary 恰恰写着 "List buckets"，
   * 自证是注解 bug）。此处以真机实测 + v1 源码为准。
   */
  async check(params: {
    type: string;
    vars: Record<string, string> | string;
    accessKey?: string;
    credential?: string;
  }): Promise<any> {
    const varObj: Record<string, string> =
      typeof params.vars === "string" ? JSON.parse(params.vars || "{}") : { ...(params.vars ?? {}) };

    // 凭据：优先用显式参数，其次从 vars 里按各存储类型的字段名取
    const rawAccessKey = params.accessKey ?? varObj.accessKey ?? varObj.username ?? "";
    const rawCredential = params.credential ?? varObj.secretKey ?? varObj.password ?? "";

    if (!rawCredential) {
      throw new Error(
        `1Panel v1 的连通性检查需要提供凭据（服务端 Credential 为必填）: type=${params.type}。` +
          `请在 vars 里带上 secretKey（S3/OSS/MinIO/COS/Kodo）或 password（SFTP/WebDAV），` +
          `或显式传 credential 参数。LOCAL 类型没有 bucket 概念，v1 也不提供检查。`,
      );
    }

    const b64 = (s: string) => Buffer.from(s, "utf-8").toString("base64");
    return this.post("/api/v1/settings/backup/buckets", {
      type: params.type,
      // v1 的 vars 是 JSON 字符串（不是对象），创建/更新账号时同理
      vars: JSON.stringify(varObj),
      accessKey: b64(rawAccessKey),
      credential: b64(rawCredential),
    });
  }

  /**
   * 列出备份账号中的文件
   * v1：POST /settings/backup/search/files { type }（v1 按备份账号**类型**查询，不支持子目录 path）
   */
  async listFiles(backupAccountID: number, path: string = "/"): Promise<any> {
    const account = await this.findAccountById(backupAccountID);
    if (!account) {
      throw new Error(`1Panel v1 找不到 id=${backupAccountID} 的备份账号，无法列出文件（可先用 list_backup_accounts 查看）`);
    }
    // v1 该接口只认 type，且返回的是该账号备份目录下的文件名列表，没有 path 参数
    return this.post("/api/v1/settings/backup/search/files", { type: account.type });
  }

  /** 按 id 从备份账号列表里取账号（v1 的列表接口无分页，直接全量） */
  private async findAccountById(id: number): Promise<any | undefined> {
    const res = await this.get("/api/v1/settings/backup/search");
    return (res?.data ?? []).find((item: any) => item?.id === id);
  }

  /** 按类型反查备份账号 id（v1 的 update/del 都只接受 id） */
  private async findAccountIdByType(type: string): Promise<number | undefined> {
    const res = await this.get("/api/v1/settings/backup/search");
    return (res?.data ?? []).find((item: any) => item?.type === type)?.id;
  }
}
