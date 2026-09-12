import { BaseAPI } from "./base.js";

export interface SnapshotCreateRequest {
  /** 名称（v1 不支持指定名称：面板按 1panel_<版本>_<系统>_<时间> 自动生成，此字段仅为兼容 v2 签名保留） */
  name: string;
  /** 描述 */
  description?: string;
  /** 是否包含 Docker（v1 无此开关，快照固定包含 docker/daemon.json，此字段仅为兼容 v2 签名保留） */
  withDocker?: boolean;
  /** v1 必填：快照存放的备份账号类型（LOCAL/OSS/S3/COS/KODO/MINIO/SFTP/WebDAV/OneDrive），缺省 LOCAL */
  from?: string;
  /** v1 必填：默认下载账号类型，缺省取 from */
  defaultDownload?: string;
  /** 快照加密密码（可选） */
  secret?: string;
}

export interface SnapshotImportRequest {
  /** 来源（备份账号类型） */
  from: string;
  /** 名称列表 */
  names: string[];
}

/**
 * 1Panel v1.x 系统快照 API 适配层
 *
 * 与原 v2 实现的语义差异（不是改前缀就能解决的）：
 *  - 列表：v1 的 dto.PageSnapshot 必填 orderBy（oneof name created_at）+ order（oneof null ascending descending），
 *    只传 page/pageSize 会被参数校验拦下，所以这里补齐排序字段。
 *  - 创建：v1 的 dto.SnapshotCreate 是 { id, from(必填), defaultDownload(必填), description, secret }，
 *    没有 name / withDocker（快照名自动生成，docker 配置固定打包）。
 *  - 载入：v1 没有 /settings/snapshot/load，语义最近的 v1 端点是 /settings/snapshot/status { id }
 *    （按 id 载入该快照的状态/明细数据）。
 *  - 恢复：v1 字段名是 isNew（不是 v2 的 isNewSnapshot），另有 reDownload/secret。
 *  - 重建：v2 的 /settings/snapshot/recreate（重试创建快照）在 v1 没有同名端点，
 *    但 v1 的 POST /settings/snapshot 传非 0 的 id 时就是"重试已有快照"（服务端走 else 分支重新打包）。
 *  - 删除：v1 /settings/snapshot/del 的 body 是 { ids, deleteWithFile }。
 */
export class SnapshotAPI extends BaseAPI {
  /**
   * 列出系统快照
   */
  async list(): Promise<any> {
    return this.post("/api/v1/settings/snapshot/search", {
      page: 1,
      pageSize: 100,
      orderBy: "created_at",
      order: "descending",
    });
  }

  /**
   * 创建系统快照
   * v1 必填 from / defaultDownload（都缺省为内置的 LOCAL 备份账号）
   */
  async create(params: SnapshotCreateRequest): Promise<any> {
    const from = params.from ?? "LOCAL";
    // name / withDocker 在 v1 不生效：快照名由面板按时间自动生成，docker 配置固定打包进快照
    return this.post("/api/v1/settings/snapshot", {
      from,
      defaultDownload: params.defaultDownload ?? from,
      description: params.description ?? "",
      secret: params.secret ?? "",
    });
  }

  /**
   * 删除系统快照
   * v1：POST /settings/snapshot/del { ids, deleteWithFile }（deleteWithFile 缺省 false，即只删记录保留文件）
   */
  async remove(ids: number[]): Promise<any> {
    return this.post("/api/v1/settings/snapshot/del", { ids });
  }

  /**
   * 更新快照描述
   * v1：POST /settings/snapshot/description/update { id, description }（与 v2 一致）
   */
  async updateDescription(id: number, description: string): Promise<any> {
    return this.post("/api/v1/settings/snapshot/description/update", { id, description });
  }

  /**
   * 导入系统快照
   * v1：POST /settings/snapshot/import { from, names, description }（与 v2 的 from/names 一致）
   */
  async import(params: SnapshotImportRequest): Promise<any> {
    return this.post("/api/v1/settings/snapshot/import", params);
  }

  /**
   * 载入快照数据
   *
   * v1 没有 /settings/snapshot/load；按 id 载入快照数据的 v1 端点是
   * POST /settings/snapshot/status { id }（返回该快照各组件的状态/明细）。
   */
  async load(id: number): Promise<any> {
    return this.post("/api/v1/settings/snapshot/status", { id });
  }

  /**
   * 恢复快照
   * v1：POST /settings/snapshot/recover { id, isNew, reDownload, secret }（注意字段名是 isNew）
   */
  async recover(id: number, isNewSnapshot: boolean = false): Promise<any> {
    return this.post("/api/v1/settings/snapshot/recover", {
      id,
      isNew: isNewSnapshot,
      reDownload: false,
    });
  }

  /**
   * 重建（重试）快照
   *
   * v2 的 /settings/snapshot/recreate 在 v1 不存在；但 v1 的
   * POST /settings/snapshot 带非 0 id 时就是"重试已有快照"（服务端加载该记录后重新打包，
   * 该分支不读 from/defaultDownload，只需满足必填校验，故这里用 LOCAL 占位）。
   */
  async recreate(id: number): Promise<any> {
    return this.post("/api/v1/settings/snapshot", {
      id,
      from: "LOCAL",
      defaultDownload: "LOCAL",
    });
  }
}
