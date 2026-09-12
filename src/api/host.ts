import { BaseAPI } from "./base.js";

export interface HostCreateRequest {
  /** 主机名 */
  name: string;
  /** 主机地址 */
  addr: string;
  /** 端口（v1 dto.HostOperate 必填，缺省补 22） */
  port?: number;
  /** 用户名（v1 dto.HostOperate 必填，缺省补 root） */
  user?: string;
  /** 认证方式: password, key */
  authMode?: "password" | "key";
  /** 密码 */
  password?: string;
  /** 私钥 */
  privateKey?: string;
  /** 私钥口令（v1 新增字段） */
  passPhrase?: string;
  /** 分组ID */
  groupID?: number;
  /** 描述 */
  description?: string;
}

export interface HostUpdateRequest {
  /** ID */
  id: number;
  /** 主机名 */
  name?: string;
  /** 主机地址 */
  addr?: string;
  /** 端口 */
  port?: number;
  /** 用户名 */
  user?: string;
  /** 认证方式: password, key */
  authMode?: "password" | "key";
  /** 密码 */
  password?: string;
  /** 私钥 */
  privateKey?: string;
  /** 私钥口令 */
  passPhrase?: string;
  /** 分组ID */
  groupID?: number;
  /** 描述 */
  description?: string;
}

export interface GroupCreateRequest {
  /** 分组名 */
  name: string;
  /** 分组类型：v1 必填（主机分组固定 "host"），不传时由本适配层补 "host" */
  type?: string;
}

export interface GroupUpdateRequest {
  /** ID */
  id: number;
  /** 分组名 */
  name?: string;
  /** 分组类型：v1 必填（主机分组固定 "host"），不传时由本适配层补 "host" */
  type?: string;
}

/** v1 分组类型：主机分组在 /groups 里 type="host"（已对照真实面板验证） */
const GROUP_TYPE_HOST = "host";

/** v1 主机默认值：dto.HostOperate 强制要求 addr/port/user */
const DEFAULT_SSH_PORT = 22;
const DEFAULT_SSH_USER = "root";

/**
 * 1Panel v1.x 主机（Host / System Group / SSH）API 适配层
 *
 * 与原 v2 实现的语义差异（v2 的 /hosts/group*、/hosts/groups*、/hosts/secret*、
 * /hosts/test/byid 在 v1 都不存在或改了名，逐条按 swagger 实测端点重写）：
 *  - 主机详情：v1 没有 GET /hosts/{id}，只能 /hosts/search 后本地按 id 过滤。
 *  - 删除主机：v1 是批量接口 /hosts/del，body 为 { ids: number[] }（不是 { id }）。
 *  - 连接测试：v1 是 POST /hosts/test/byid/{id}（id 在**路径**里，无 body），
 *    不是 v2 的 POST /hosts/test/byid + { id }。
 *  - 主机树：v1 是 POST /hosts/tree（body 可选 { info }），不是 GET。
 *  - 改主机分组：v2 是 POST /hosts/group，v1 是 POST /hosts/update/group
 *    （body 同 v2：{ id, groupID }）。
 *  - 分组：v2 的 /hosts/groups* 全部改为 v1 的 /groups*，且 v1 每个分组接口都
 *    必带 type（主机分组 = "host"）——/groups/search、/groups、/groups/update。
 *  - 分组删除：v1 是 POST /groups/del + { id }（不是 /hosts/groups/del）。
 *  - SSH 密钥：v2 的 /hosts/secret* 在 v1 是 /hosts/ssh/generate 与 /hosts/ssh/secret
 *    （POST，body { encryptionMode }）；v1 没有 GET secret、没有 secret/del、
 *    没有 secret/sync —— 相应方法改为抛错。
 *  - SSH 密钥更新：v1 没有 /hosts/secret/update，只能读主机详情后走 /hosts/update 回写，
 *    且必须由调用方在本次调用中给出新凭据（回写 /hosts/search 读到的明文密码会触发
 *    面板的 base64 解密错误，详见 update() 注释）。
 *  - SSH 日志：v1 /hosts/ssh/log 必带 Status（Success|Failed|All）+ 分页。
 */
export class HostAPI extends BaseAPI {
  /** v1 dto.HostOperate 必填 addr/port/user，缺省时补齐（create 与 update 共用） */
  private withSSHDefaults<T extends { port?: number; user?: string }>(params: T): T & { port: number; user: string } {
    return { ...params, port: params.port ?? DEFAULT_SSH_PORT, user: params.user ?? DEFAULT_SSH_USER };
  }

  // ==================== Host ====================

  /**
   * 列出主机
   */
  async list(): Promise<any> {
    // v1 只认 POST /hosts/search（必填 page/pageSize），v2 的查询参数形式不适用
    return this.post("/api/v1/hosts/search", { page: 1, pageSize: 100 });
  }

  /**
   * 获取主机信息
   * v1 没有 GET /hosts/{id}，用 /hosts/search 拉全量后按 id 过滤
   */
  async getHost(id: number): Promise<any> {
    const res = await this.post("/api/v1/hosts/search", { page: 1, pageSize: 500 });
    const items: any[] = res?.data?.items ?? [];
    return { ...res, data: items.find((h: any) => Number(h?.id) === Number(id)) ?? null };
  }

  /**
   * 创建主机
   */
  async create(params: HostCreateRequest): Promise<any> {
    return this.post("/api/v1/hosts", this.withSSHDefaults(params));
  }

  /**
   * 更新主机
   *
   * v1 两个坑（实测）：
   *  1. dto.HostOperate 在 update 上同样强制 addr/port/user，只传 id 会被拒绝，
   *     所以缺字段时先读主机详情回填；
   *  2. **绝不能把读回来的 password/privateKey 原样回写**：/hosts/search 返回的是
   *     面板解密后的明文，而 /hosts/update 会把 password 当 base64 解（面板侧重新加密），
   *     回写明文会得到 `请求参数错误: illegal base64 data at input byte N`。
   *     因此只有调用方显式传来的凭据才会进 body。
   */
  async update(params: HostUpdateRequest): Promise<any> {
    const needFill = params.addr == null || params.port == null || params.user == null;
    const current = needFill ? (await this.getHost(params.id))?.data : null;
    if (needFill && !current) {
      throw new Error(`1Panel v1 未找到主机 id=${params.id}，且未提供 addr/port/user（v1 更新时三者必填）`);
    }
    const body: any = {
      id: params.id,
      addr: params.addr ?? current?.addr,
      port: params.port ?? current?.port,
      user: params.user ?? current?.user,
      authMode: params.authMode ?? current?.authMode,
      name: params.name ?? current?.name,
      description: params.description ?? current?.description,
      groupID: params.groupID ?? current?.groupID,
    };
    // 凭据只在调用方显式传入时才写（回写读到的明文会触发 base64 解析错误）
    if (params.password !== undefined) body.password = params.password;
    if (params.privateKey !== undefined) body.privateKey = params.privateKey;
    if (params.passPhrase !== undefined) body.passPhrase = params.passPhrase;
    return this.post("/api/v1/hosts/update", this.withSSHDefaults(body));
  }

  /**
   * 删除主机
   * v1 是批量接口 dto.BatchDeleteReq { ids: number[] }，不是 { id }
   */
  async remove(id: number, extraIds: number[] = []): Promise<any> {
    return this.post("/api/v1/hosts/del", { ids: [id, ...extraIds] });
  }

  /**
   * 测试主机连接（按已保存主机的 id）
   * v1 的 id 在路径上：POST /hosts/test/byid/{id}，无请求体
   */
  async testConnection(id: number): Promise<any> {
    return this.post(`/api/v1/hosts/test/byid/${id}`, {});
  }

  /**
   * 测试主机连接 (通过信息)
   * v1 dto.HostConnTest 必填 addr/port/user
   */
  async testConnectionByInfo(params: HostCreateRequest): Promise<any> {
    return this.post("/api/v1/hosts/test/byinfo", this.withSSHDefaults(params));
  }

  /**
   * 获取主机树
   * v1 是 POST（dto.SearchForTree，body 可选 { info }），不是 GET
   */
  async getTree(info = ""): Promise<any> {
    return this.post("/api/v1/hosts/tree", { info });
  }

  /**
   * 更新主机分组
   * v1 端点为 /hosts/update/group（v2 是 /hosts/group），body 相同
   */
  async updateHostGroup(id: number, groupID: number): Promise<any> {
    return this.post("/api/v1/hosts/update/group", { id, groupID });
  }

  // ==================== Group（v1 统一在 /groups*，且必带 type） ====================

  /**
   * 列出分组
   * v1 是 POST /groups/search + { type }（返回数组，不是分页对象）
   */
  async listHostGroups(type: string = GROUP_TYPE_HOST): Promise<any> {
    return this.post("/api/v1/groups/search", { type });
  }

  /**
   * 创建分组
   * v1 dto.GroupCreate 必填 name + type
   */
  async createHostGroup(params: GroupCreateRequest): Promise<any> {
    return this.post("/api/v1/groups", { name: params.name, type: params.type ?? GROUP_TYPE_HOST });
  }

  /**
   * 更新分组
   * v1 dto.GroupUpdate 必填 type；v1 无 isDefault 字段，故不透传
   */
  async updateHostGroupByID(params: GroupUpdateRequest): Promise<any> {
    const body: any = { id: params.id, type: params.type ?? GROUP_TYPE_HOST };
    if (params.name !== undefined) body.name = params.name;
    return this.post("/api/v1/groups/update", body);
  }

  /**
   * 删除分组
   * v1 是 POST /groups/del + { id }（不是 /hosts/groups/del）
   */
  async deleteHostGroup(id: number): Promise<any> {
    return this.post("/api/v1/groups/del", { id });
  }

  // ==================== SSH（v2 的 /hosts/secret* → v1 的 /hosts/ssh/*） ====================

  /**
   * 生成主机 SSH 密钥
   * v1 是 /hosts/ssh/generate，必填 { encryptionMode }（rsa|ed25519|ecdsa|dsa）
   */
  async generateSSHKey(id: number, encryptionMode = "rsa", password?: string): Promise<any> {
    const body: any = { encryptionMode };
    if (password !== undefined) body.password = password;
    return this.post("/api/v1/hosts/ssh/generate", body);
  }

  /**
   * 获取主机 SSH 密钥
   * v1 是 POST /hosts/ssh/secret（body { encryptionMode }，返回字符串），
   * 没有 v2 的 GET /hosts/secret/{id}
   */
  async getSSHKey(id: number, encryptionMode = "rsa"): Promise<any> {
    return this.post("/api/v1/hosts/ssh/secret", { encryptionMode });
  }

  /**
   * 删除主机 SSH 密钥
   * v1 只有系统级 SSH 密钥接口，没有按主机删除密钥的端点（v2 专有 /hosts/secret/del）
   */
  async deleteSSHKey(id: number): Promise<any> {
    throw new Error("1Panel v1 不支持该接口（v2 专有）: POST /hosts/secret/del —— v1 无按主机删除 SSH 密钥端点");
  }

  /**
   * 同步主机 SSH 密钥
   * v1 没有密钥同步端点（v2 专有 /hosts/secret/sync）
   */
  async syncSSHKey(id: number): Promise<any> {
    throw new Error("1Panel v1 不支持该接口（v2 专有）: POST /hosts/secret/sync —— v1 无 SSH 密钥同步端点");
  }

  /**
   * 更新主机 SSH 密钥
   * v1 没有 /hosts/secret/update，改为：读主机详情 → 合并**新传入的**凭据 → POST /hosts/update 回写。
   * 注意：不把读回来的旧 password/privateKey 回写（v1 update 要求 password 是 base64/新值，
   * 回写明文会报 illegal base64 data），只回填 addr/port/user 等非凭据字段。
   */
  async updateSSHKey(id: number, authMode: string, password?: string, privateKey?: string): Promise<any> {
    const current = (await this.getHost(id))?.data;
    if (!current) {
      throw new Error(`1Panel v1 未找到主机 id=${id}，无法更新 SSH 凭据`);
    }
    const body: any = {
      id,
      name: current.name,
      addr: current.addr,
      port: current.port,
      user: current.user,
      description: current.description,
      groupID: current.groupID,
      authMode,
    };
    if (authMode === "key") {
      if (privateKey === undefined) {
        throw new Error("1Panel v1 切换为 key 认证时必须在本次调用中传入 privateKey（v1 不会沿用旧密钥）");
      }
      body.privateKey = privateKey;
    } else {
      if (password === undefined) {
        throw new Error("1Panel v1 切换为 password 认证时必须在本次调用中传入 password（v1 不会沿用旧密码）");
      }
      body.password = password;
    }
    return this.post("/api/v1/hosts/update", body);
  }

  /**
   * 获取主机 SSH 配置（sshd_config 文件内容，返回字符串）
   */
  async getSSHConf(): Promise<any> {
    return super.get("/api/v1/hosts/ssh/conf");
  }

  /**
   * 获取主机 SSH 登录日志
   * v1 dto.SearchSSHLog 必填 Status + page + pageSize（Status ∈ Success|Failed|All）
   */
  async getSSHLogs(status = "All", page = 1, pageSize = 100): Promise<any> {
    return this.post("/api/v1/hosts/ssh/log", { Status: status, page, pageSize });
  }
}
