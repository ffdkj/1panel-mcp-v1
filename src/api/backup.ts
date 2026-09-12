import { BaseAPI } from "./base.js";

/**
 * 1Panel v1.x 备份 API 适配层（tag System Setting 下的 /settings/backup/*）
 *
 * 与原 v2 实现的语义差异：
 *  - 列表：v1 只注册了 GET /settings/backup/search（列出备份账号，无分页）；
 *    v2 用的 POST /settings/backup/search 在 v1 未注册（实测返回安全入口守卫页），不能使用。
 *  - 创建：POST /settings/backup 在 v1 是"创建**备份账号**"（dto.BackupOperate），
 *    且 v1 的 vars 是 JSON **字符串**（不是对象），v1 也没有 name/isDefault 字段（一种类型一个账号）。
 *  - 恢复：v2 的 /settings/backup/restore 在 v1 不存在，v1 的等价端点是 /settings/backup/recover，
 *    但它必须提供 { source, type, file }（source=备份账号类型，type=数据类型，file=备份文件完整路径），
 *    没有"按 id 恢复"的入口，因此本方法只能抛错（详见 restore 注释）。
 *  - 删除：v1 /settings/backup/del 的 id 是**备份账号** id（备份记录/文件用 /settings/backup/record/del）。
 */
export class BackupAPI extends BaseAPI {
  /**
   * 列出备份账号
   * v1：GET /settings/backup/search（返回数组，无分页参数）
   */
  async list(): Promise<any> {
    return this.get("/api/v1/settings/backup/search");
  }

  /**
   * 创建备份账号
   * v1：POST /settings/backup，body = dto.BackupOperate { type, vars(JSON 字符串), bucket, accessKey, credential, backupPath }
   */
  async create(backup: any): Promise<any> {
    const body = { ...(backup ?? {}) };
    // v1 的 vars 是 JSON 字符串（v2 传对象），这里做一次归一化
    if (body.vars && typeof body.vars !== "string") {
      body.vars = JSON.stringify(body.vars);
    }
    // v1 的 dto.BackupOperate 没有 name / isDefault（账号按 type 唯一）
    delete body.name;
    delete body.isDefault;
    return this.post("/api/v1/settings/backup", body);
  }

  /**
   * 恢复备份
   *
   * v2 端点 /settings/backup/restore（body {id}）在 v1 不存在（实测守卫页）。
   * v1 的等价端点是 POST /api/v1/settings/backup/recover，但它的 DTO 是
   * dto.CommonRecover { source, type, file, name, detailName, secret }：
   *   - source 必须是备份账号类型（LOCAL/OSS/S3/COS/KODO/MINIO/SFTP/WebDAV/OneDrive）
   *   - type 必须是数据类型（app/mysql/mariadb/redis/website/postgresql）
   *   - file 必须是备份文件的完整路径（如 /opt/1panel/backup/system/xxx.tar.gz）
   * 单靠一个数字 id 无法构造该请求（v1 的备份记录只能按 type 分页查询，没有 by-id 反查），
   * 所以这里按规约抛明确错误，而不是发一个注定 400 的请求。
   */
  async restore(id: number): Promise<any> {
    throw new Error(
      `1Panel v1 不存在按 id 恢复备份的接口（v2 的 /settings/backup/restore 为 v2 专有）。` +
        `请在 v1 使用 POST /api/v1/settings/backup/recover，并提供 { source, type, file }（收到 id=${id}）；` +
        `系统快照的按 id 恢复是 POST /api/v1/settings/snapshot/recover。`,
    );
  }

  /**
   * 删除备份账号
   * v1：POST /settings/backup/del { id }（id 为备份账号 id；备份记录请用 /settings/backup/record/del）
   */
  async remove(id: number): Promise<any> {
    return this.post("/api/v1/settings/backup/del", { id });
  }
}
