import { BaseAPI } from "./base.js";

/**
 * 1Panel v1.x 数据库 API 适配层
 *
 * 与原 v2 实现的语义差异（不是改前缀就能解决的）：
 *  - v1 没有泛型路径：mysql 走 /databases/*，postgresql 走 /databases/pg/*，redis 走 /databases/redis/*，
 *    Redis 的「数据库」其实就是实例连接（/databases/db），Database Redis tag 里没有分页 search。
 *  - v1 用「实例名」(dto.DatabaseOption.database，如 mysql / mariadb / redis 的实例名) 定位数据库，
 *    列表/删除/状态/配置都要先带 database(实例名)，v2 只给 type。
 *  - 密码类字段（password / value）v1 要求客户端先 base64 编码：API 层会 StdEncoding 解码
 *    （与 v1 面板前端 Base64.encode 行为一致），发明文会被判为非法参数。
 *  - 变量更新 v1 收的是数组 [{ param, value }]，不是 v2 的 Record<string, string>。
 */

// ==================== MySQL ====================

export interface MySQLBindUserRequest {
  /** 数据库名称（实例名，v1 的 database 是实例而不是库名） */
  database: string;
  /** 库名 */
  db: string;
  /** 用户密码（明文，本模块负责 base64） */
  password: string;
  /** 权限 (如: localhost, %, IP地址) */
  permission: string;
  /** 用户名 */
  username: string;
}

export interface MySQLChangePasswordRequest {
  /** 数据库名称（实例名） */
  database: string;
  /** 来源: local, remote */
  from: "local" | "remote";
  /** 数据库ID */
  id: number;
  /** 类型 */
  type: "mysql" | "mariadb" | "postgresql";
  /** 新密码（明文，本模块负责 base64） */
  value: string;
}

export interface MySQLChangeAccessRequest {
  /** 数据库名称（实例名） */
  database: string;
  /** 来源: local, remote */
  from: "local" | "remote";
  /** 数据库ID */
  id: number;
  /** 类型 */
  type: "mysql" | "mariadb" | "postgresql";
  /** 访问权限值 (如: localhost, %, 具体IP) */
  value: string;
}

// ==================== PostgreSQL ====================

export interface PostgreSQLBindUserRequest {
  /** 数据库名称（实例名） */
  database: string;
  /** 数据库实例名称 */
  name: string;
  /** 用户密码（明文，本模块负责 base64） */
  password: string;
  /** 是否超级用户 */
  superUser?: boolean;
  /** 用户名 */
  username: string;
}

export interface PostgreSQLChangePrivilegesRequest {
  /** 数据库名称（实例名） */
  database: string;
  /** 库名（v1 dto.PostgresqlPrivileges.name 必填） */
  name?: string;
  /** 用户名（v1 必填） */
  username?: string;
  /** 是否超级用户（v1 的权限值就是这一个开关） */
  superUser?: boolean;
  /** 以下 v2 字段在 v1 的 /databases/pg/privileges 里不适用（swagger 注解过期，实际绑定 dto.PostgresqlPrivileges） */
  from?: "local" | "remote";
  /** 数据库ID（v1 该接口不需要） */
  id?: number;
  /** 类型（v1 该接口不需要） */
  type?: "postgresql";
  /** 权限值（v1 该接口不需要） */
  value?: string;
}

// ==================== Redis ====================

export interface RedisChangePasswordRequest {
  /** 数据库实例ID */
  id: number;
  /** 新密码（明文，本模块负责 base64） */
  value: string;
}

export interface RedisConf {
  /** 数据库实例ID（v1 的 conf 接口只认实例名，本模块按 id 反查） */
  id: number;
  /** v2 的整份配置内容；v1 的 /databases/redis/conf/update 不收这个字段，给了会被丢弃 */
  content?: string;
  /** v1 支持的三个可调项（字符串形式） */
  timeout?: string;
  maxclients?: string;
  maxmemory?: string;
}

/** v1 支持的数据库类型（type 别名归一后的结果） */
type DBType = "mysql" | "mariadb" | "postgresql" | "redis";

/**
 * v1 的密码类字段走 base64：后端 base64.StdEncoding 解码后再使用
 * （v1 前端也是 Base64.encode(password) 后才提交），所以这里统一编码。
 */
function encodeSecret(secret: string): string {
  return Buffer.from(secret, "utf8").toString("base64");
}

function normalizeType(type: string): DBType {
  const t = String(type ?? "").trim().toLowerCase();
  if (t === "mysql" || t === "mariadb" || t === "postgresql" || t === "redis") {
    return t;
  }
  if (t === "pg") {
    return "postgresql";
  }
  throw new Error(`1Panel v1 只支持 mysql / mariadb / postgresql / redis 四种数据库类型，收到: ${type}`);
}

export class DatabaseAPI extends BaseAPI {
  // ==================== 内部工具 ====================

  /**
   * v1 定位数据库要「实例名」而不是类型：面板「数据库」页先拉 GET /databases/db/list/{type}
   * 拿到实例（本机/远程）列表，再拿其中的 database 字段去做查询/删除/取状态，本方法复刻这一层。
   * type 允许逗号分隔（v1 面板查 MySQL 时就是 "mysql,mariadb"）。
   */
  private async resolveInstance(
    type: string,
    from?: "local" | "remote",
  ): Promise<{ database: string; type: string }> {
    const res = await this.get(`/api/v1/databases/db/list/${type}`);
    const options: any[] = res?.data ?? [];
    const hit =
      (from ? options.find((item) => item?.from === from) : undefined) ??
      options.find((item) => item?.from === "local") ??
      options[0];
    if (!hit?.database) {
      throw new Error(
        `1Panel v1 未找到 ${type} 数据库实例，请先在面板「数据库」中安装/添加该类型实例（GET /databases/db/list/${type} 为空）`,
      );
    }
    return { database: String(hit.database), type: String(hit.type ?? "") };
  }

  /**
   * Redis 的 conf/status/persistence 接口在 v1 只接受实例名（dto.OperationWithName { name }），
   * 而本模块的公开签名沿用 v2 的 id，所以按 id 到实例列表里反查名字。
   */
  private async redisInstanceName(id: number): Promise<string> {
    const res = await this.get("/api/v1/databases/db/list/redis");
    const hit = (res?.data ?? []).find((item: any) => item?.id === id);
    if (!hit?.database) {
      throw new Error(`1Panel v1 未找到 id=${id} 的 Redis 实例（id 取自 list("redis") 的返回）`);
    }
    return String(hit.database);
  }

  // ==================== 通用 ====================

  /**
   * 列出数据库
   * v1 按类型拆成各自的路径：
   *  - mysql/mariadb → POST /databases/search（dto.MysqlDBSearch：database=实例名 + order/orderBy/page/pageSize 必填）
   *  - postgresql    → POST /databases/pg/search（dto.PostgresqlDBSearch，同样要求实例名）
   *  - redis         → GET /databases/db/list/redis（v1 的 Redis tag 没有分页 search，Redis 实例本身即 /databases/db 记录）
   */
  async list(type: string): Promise<any> {
    const t = normalizeType(type);
    switch (t) {
      case "mysql":
      case "mariadb": {
        const instance = await this.resolveInstance("mysql,mariadb");
        return this.post("/api/v1/databases/search", {
          database: instance.database,
          page: 1,
          pageSize: 100,
          order: "null",
          orderBy: "name",
          info: "",
        });
      }
      case "postgresql": {
        const instance = await this.resolveInstance("postgresql");
        return this.post("/api/v1/databases/pg/search", {
          database: instance.database,
          page: 1,
          pageSize: 100,
          order: "null",
          orderBy: "name",
          info: "",
        });
      }
      case "redis":
        return this.get("/api/v1/databases/db/list/redis");
      default:
        throw new Error(`1Panel v1 不支持该数据库类型: ${type}`);
    }
  }

  /**
   * 创建数据库
   *  - mysql/mariadb → POST /databases（dto.MysqlDBCreate 必填 database/format/from/name/password/permission/username，password 走 base64）
   *  - postgresql    → POST /databases/pg（dto.PostgresqlDBCreate 必填 database/from/name/password/username）
   *  - redis         → POST /databases/db（v1 的 Redis 没有「建库」，建的是实例连接，dto.DatabaseCreate 必填 from/name/type/username/version，密码明文）
   */
  async create(type: string, db: any): Promise<any> {
    const t = normalizeType(type);
    const payload: any = { ...(db ?? {}) };
    switch (t) {
      case "mysql":
      case "mariadb": {
        if (!payload.name || !payload.username || !payload.password) {
          throw new Error("1Panel v1 创建 MySQL 数据库需要 name（库名）/username/password");
        }
        payload.database = payload.database ?? (await this.resolveInstance("mysql,mariadb")).database;
        payload.from = payload.from ?? "local";
        payload.format = payload.format ?? "utf8mb4";
        payload.permission = payload.permission ?? "%";
        payload.password = encodeSecret(String(payload.password));
        return this.post("/api/v1/databases", payload);
      }
      case "postgresql": {
        if (!payload.name || !payload.username || !payload.password) {
          throw new Error("1Panel v1 创建 PostgreSQL 数据库需要 name（库名）/username/password");
        }
        payload.database = payload.database ?? (await this.resolveInstance("postgresql")).database;
        payload.from = payload.from ?? "local";
        payload.password = encodeSecret(String(payload.password));
        return this.post("/api/v1/databases/pg", payload);
      }
      case "redis": {
        // v1 的 Redis 没有「建库」概念，"数据库"= 实例连接记录，走统一的 /databases/db（dto.DatabaseCreate）
        if (!payload.name) {
          throw new Error("1Panel v1 添加 Redis 实例需要 name（实例名）");
        }
        payload.type = "redis";
        // 本机实例由面板安装时自动登记，这里默认按「远程实例」处理（需要 address/port/password）
        payload.from = payload.from ?? "remote";
        payload.version = payload.version ?? "7.x";
        // dto.DatabaseCreate 的 username 是必填项，Redis 6/7 的默认用户就是 default
        payload.username = payload.username ?? "default";
        return this.post("/api/v1/databases/db", payload);
      }
      default:
        throw new Error(`1Panel v1 不支持该数据库类型: ${type}`);
    }
  }

  /**
   * 删除数据库
   *  - mysql/mariadb → POST /databases/del（dto.MysqlDBDelete 必填 database=实例名/id/type）
   *  - postgresql    → POST /databases/pg/del（dto.PostgresqlDBDelete，同样必填实例名）
   *  - redis         → POST /databases/db/del（删的是实例记录，dto.DatabaseDelete 只需 id）
   */
  async remove(type: string, id: number): Promise<any> {
    const t = normalizeType(type);
    switch (t) {
      case "mysql":
      case "mariadb": {
        const instance = await this.resolveInstance("mysql,mariadb");
        return this.post("/api/v1/databases/del", {
          id,
          type: instance.type || t,
          database: instance.database,
        });
      }
      case "postgresql": {
        const instance = await this.resolveInstance("postgresql");
        return this.post("/api/v1/databases/pg/del", {
          id,
          type: "postgresql",
          database: instance.database,
        });
      }
      case "redis":
        return this.post("/api/v1/databases/db/del", { id });
      default:
        throw new Error(`1Panel v1 不支持该数据库类型: ${type}`);
    }
  }

  /**
   * 获取数据库详情
   * v1 没有 GET /databases/{type}/{id}（也没有按 id 查详情的路由），
   * 退回「列表查询 + 本地按 id 过滤」——与 containers.listByImage 的处理思路一致。
   */
  async getDetail(type: string, id: number): Promise<any> {
    const res = await this.list(type);
    const payload = res?.data;
    const items: any[] = Array.isArray(payload) ? payload : (payload?.items ?? []);
    const hit = items.find((item: any) => item?.id === id);
    if (!hit) {
      throw new Error(`1Panel v1 未找到 id=${id} 的 ${type} 数据库/实例（v1 无按 id 查详情接口，已回退为列表过滤）`);
    }
    return { ...res, data: hit };
  }

  // ==================== MySQL ====================

  /**
   * MySQL - 绑定用户
   * v1 dto.BindUser = { database, db, password, permission, username }，password 需 base64。
   */
  async mysqlBindUser(params: MySQLBindUserRequest): Promise<any> {
    return this.post("/api/v1/databases/bind", {
      database: params?.database,
      db: params?.db,
      username: params?.username,
      permission: params?.permission,
      password: encodeSecret(String(params?.password ?? "")),
    });
  }

  /**
   * MySQL - 修改密码
   * v1 dto.ChangeDBInfo = { database, from, type, value, id? }，value 需 base64。
   */
  async mysqlChangePassword(params: MySQLChangePasswordRequest): Promise<any> {
    return this.post("/api/v1/databases/change/password", {
      ...params,
      value: encodeSecret(String(params?.value ?? "")),
    });
  }

  /**
   * MySQL - 修改远程访问权限（dto.ChangeDBInfo，v1 不解码 value）
   */
  async mysqlChangeAccess(params: MySQLChangeAccessRequest): Promise<any> {
    return this.post("/api/v1/databases/change/access", params);
  }

  /**
   * MySQL - 获取数据库信息
   * v1 是 POST /databases/common/info + dto.OperationWithNameAndType { type, name }（name=实例名），
   * 不是 v2 的 { from }；这里按 from 挑本机或远程实例。
   */
  async mysqlGetInfo(from: "local" | "remote" = "local"): Promise<any> {
    const instance = await this.resolveInstance("mysql,mariadb", from);
    return this.post("/api/v1/databases/common/info", { type: instance.type || "mysql", name: instance.database });
  }

  /**
   * MySQL - 获取远程访问配置
   * v1 是 POST /databases/remote + dto.OperationWithNameAndType（v2 是 GET），返回 boolean。
   */
  async mysqlGetRemoteAccess(): Promise<any> {
    const instance = await this.resolveInstance("mysql,mariadb");
    return this.post("/api/v1/databases/remote", { type: instance.type || "mysql", name: instance.database });
  }

  /**
   * MySQL - 更新远程访问配置
   * 1Panel v1 不支持该接口（v2 专有）: /databases/remote 的写操作
   * v1 的 Database Mysql tag 只有 LoadRemoteAccess（POST /databases/remote 读取当前是否允许远程访问），
   * 没有开关端点；面板里远程访问是应用安装参数（mysql 应用参数）的一部分，不在本模块覆盖范围。
   */
  async mysqlUpdateRemoteAccess(privilege: boolean): Promise<any> {
    throw new Error(
      "1Panel v1 不支持该接口（v2 专有）: 设置 MySQL 远程访问（privilege=" +
        `${privilege}）；v1 只能读取（POST /databases/remote），开关请到面板「应用商店 → MySQL → 参数」调整`,
    );
  }

  /**
   * MySQL - 获取状态信息
   * v1 是 POST /databases/status + dto.OperationWithNameAndType（v2 是 GET）。
   */
  async mysqlGetStatus(): Promise<any> {
    const instance = await this.resolveInstance("mysql,mariadb");
    return this.post("/api/v1/databases/status", { type: instance.type || "mysql", name: instance.database });
  }

  /**
   * MySQL - 获取变量信息
   * v1 是 POST /databases/variables + dto.OperationWithNameAndType（v2 是 GET）。
   */
  async mysqlGetVariables(): Promise<any> {
    const instance = await this.resolveInstance("mysql,mariadb");
    return this.post("/api/v1/databases/variables", { type: instance.type || "mysql", name: instance.database });
  }

  /**
   * MySQL - 更新变量
   * v1 dto.MysqlVariablesUpdate = { database(实例名), type, variables: [{ param, value }] }：
   * 必填两个字段，且 variables 是数组（不是 v2 的 Record）。
   */
  async mysqlUpdateVariables(variables: Record<string, string>): Promise<any> {
    const instance = await this.resolveInstance("mysql,mariadb");
    const list = Object.entries(variables ?? {}).map(([param, value]) => ({ param, value }));
    if (list.length === 0) {
      throw new Error("更新 MySQL 变量需要至少一个 key/value");
    }
    return this.post("/api/v1/databases/variables/update", {
      database: instance.database,
      type: instance.type || "mysql",
      variables: list,
    });
  }

  // ==================== PostgreSQL ====================

  /**
   * PostgreSQL - 绑定用户
   * v1 dto.PostgresqlBindUser = { database, name, password, username, superUser? }，password 需 base64。
   */
  async postgresqlBindUser(params: PostgreSQLBindUserRequest): Promise<any> {
    return this.post("/api/v1/databases/pg/bind", {
      database: params?.database,
      name: params?.name,
      username: params?.username,
      superUser: params?.superUser ?? false,
      password: encodeSecret(String(params?.password ?? "")),
    });
  }

  /**
   * PostgreSQL - 修改密码
   * v1 走 dto.ChangeDBInfo（与 MySQL 同一个结构），type 固定 postgresql，value 需 base64。
   */
  async postgresqlChangePassword(params: MySQLChangePasswordRequest): Promise<any> {
    return this.post("/api/v1/databases/pg/password", {
      ...params,
      type: "postgresql",
      value: encodeSecret(String(params?.value ?? "")),
    });
  }

  /**
   * PostgreSQL - 修改权限
   * 注意：swagger 里 /databases/pg/privileges 标注的 body 是 dto.ChangeDBInfo（**过期注解**），
   * v1 处理器实际绑定的是 dto.PostgresqlPrivileges = { database, name, username, superUser }
   * （面板前端 PgChangePrivileges 也是这个形状），所以这里按真实 DTO 组装，v2 的 from/type/value 不再使用。
   */
  async postgresqlChangePrivileges(params: PostgreSQLChangePrivilegesRequest): Promise<any> {
    const p = params ?? ({} as PostgreSQLChangePrivilegesRequest);
    if (!p.database || !p.name || !p.username) {
      throw new Error(
        "1Panel v1 的 /databases/pg/privileges 需要 database（实例名）/ name（库名）/ username / superUser；" +
          "v2 的 { from, type, value } 在 v1 不适用（该端点实际绑定 dto.PostgresqlPrivileges）",
      );
    }
    return this.post("/api/v1/databases/pg/privileges", {
      database: p.database,
      name: p.name,
      username: p.username,
      superUser: p.superUser ?? false,
    });
  }

  /**
   * PostgreSQL - 获取数据库列表
   * v1 没有 GET /databases/pg（那个路径只有 POST 建库），PG 的库列表就是 POST /databases/pg/search，
   * 与 list("postgresql") 同义，直接复用。
   */
  async postgresqlListDatabases(): Promise<any> {
    return this.list("postgresql");
  }

  // ==================== Redis ====================

  /**
   * Redis - 获取配置
   * v1 是 POST /databases/redis/conf + dto.OperationWithName { name }（name=实例名，不是 id）。
   */
  async redisGetConf(id: number): Promise<any> {
    return this.post("/api/v1/databases/redis/conf", { name: await this.redisInstanceName(id) });
  }

  /**
   * Redis - 更新配置
   * v1 dto.RedisConfUpdate = { database, timeout?, maxclients?, maxmemory? }（database 必填，字段级更新）；
   * v2 的整份 content 覆盖在 v1 不存在，只传 content 会直接抛错。
   */
  async redisUpdateConf(params: RedisConf): Promise<any> {
    const body: any = { database: await this.redisInstanceName(params?.id) };
    if (params?.timeout !== undefined) body.timeout = String(params.timeout);
    if (params?.maxclients !== undefined) body.maxclients = String(params.maxclients);
    if (params?.maxmemory !== undefined) body.maxmemory = String(params.maxmemory);
    if (Object.keys(body).length === 1) {
      throw new Error(
        "1Panel v1 的 /databases/redis/conf/update 只支持 timeout / maxclients / maxmemory 三个字段，" +
          "v2 的整份 content 覆盖在 v1 不存在（要改配置文件请用面板的配置文件入口）",
      );
    }
    return this.post("/api/v1/databases/redis/conf/update", body);
  }

  /**
   * Redis - 修改密码
   * v1 dto.ChangeRedisPass = { database, value }，value 需 base64；database 是实例名而非 id。
   */
  async redisChangePassword(params: RedisChangePasswordRequest): Promise<any> {
    return this.post("/api/v1/databases/redis/password", {
      database: await this.redisInstanceName(params?.id),
      value: encodeSecret(String(params?.value ?? "")),
    });
  }

  /**
   * Redis - 获取状态
   * v1 是 POST /databases/redis/status + dto.OperationWithName { name }；本方法没有入参，
   * 取第一个（优先本机）Redis 实例。
   */
  async redisGetStatus(): Promise<any> {
    const instance = await this.resolveInstance("redis");
    return this.post("/api/v1/databases/redis/status", { name: instance.database });
  }

  /**
   * Redis - 获取持久化配置
   * v1 是 POST /databases/redis/persistence/conf + dto.OperationWithName { name }。
   */
  async redisGetPersistenceConf(id: number): Promise<any> {
    return this.post("/api/v1/databases/redis/persistence/conf", { name: await this.redisInstanceName(id) });
  }

  /**
   * Redis - 更新持久化配置
   * v1 dto.RedisConfPersistenceUpdate 必填 database + type（aof|rbd）：v1 把 AOF 与 RDB 拆成两次提交，
   *  - AOF：{ database, type:"aof", appendonly, appendfsync }
   *  - RDB：{ database, type:"rbd", save }，save 是 "秒 次数" 用逗号拼接的字符串（面板同样格式）
   * 这里按入参推断 type，也允许调用方显式传 type。
   */
  async redisUpdatePersistenceConf(
    id: number,
    params: { appendonly?: string; appendfsync?: string; save?: string; type?: "aof" | "rbd" },
  ): Promise<any> {
    // 只给了 save（RDB 快照）而没给 AOF 两项时按 rbd 提交，否则按 aof；显式传 type 时以调用方为准
    const rdbOnly = params?.save !== undefined && params?.appendonly === undefined && params?.appendfsync === undefined;
    const body: any = {
      database: await this.redisInstanceName(id),
      type: params?.type ?? (rdbOnly ? "rbd" : "aof"),
    };
    if (params?.appendonly !== undefined) body.appendonly = params.appendonly;
    if (params?.appendfsync !== undefined) body.appendfsync = params.appendfsync;
    if (params?.save !== undefined) body.save = params.save;
    return this.post("/api/v1/databases/redis/persistence/update", body);
  }
}
