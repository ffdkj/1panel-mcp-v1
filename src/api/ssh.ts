import { BaseAPI } from "./base.js";

/**
 * 1Panel v1.x SSH API 适配层（v1 tag `SSH`，共 8 个端点）
 *
 * 与原 v2 实现的语义差异：
 *  - 读取配置：v1 是 GET /hosts/ssh/conf（返回 sshd_config 全文；v2 是 POST，故此处 GET 才正确）。
 *  - 修改配置：v1 没有 POST /hosts/ssh/conf，改为 POST /hosts/ssh/update，
 *    且 body 是"单键"DTO dto.SSHUpdate = { key, newValue, oldValue }（key 必填），
 *    key 必须是 sshd_config 里的指令名（Port、ListenAddress、PasswordAuthentication、
 *    PubkeyAuthentication、PermitRootLogin、UseDNS …），一次只能改一项，
 *    所以 updateConfig() 收到多字段对象时会拆成多次请求。
 *  - 整文件替换：v1 的真实路径是 POST /hosts/ssh/conffile/update（dto.SSHConf = { file }）。
 *    swagger.json 把它记成 /hosts/conffile/update，但实测该路径返回 HTML 安全入口守卫页
 *    （不可达），以 backend/router/ro_host.go 为准。
 *  - Port 特殊：后端改 Port 时会用 oldValue 去改防火墙规则和本机 host 记录，
 *    因此这里先从当前配置里读出旧端口一并提交，避免端口改了但防火墙没放行。
 */
export class SSHAPI extends BaseAPI {
  /** 读取 SSH 配置（v1 返回 dto.SSHConf 文本内容） */
  async getConfig(): Promise<any> {
    return this.get("/api/v1/hosts/ssh/conf");
  }

  /**
   * 修改 SSH 配置。
   *
   * v2 是 { ...任意字段 } 一次性提交；v1 是 { key, newValue, oldValue } 单项提交，
   * 故这里按"键名大小写不敏感"匹配当前配置里的真实键名后逐项提交。
   */
  async updateConfig(config: any): Promise<any> {
    const entries = sshEntries(config);
    if (entries.length === 0) {
      throw new Error("1Panel v1 的 SSH 配置接口只接受单键更新：POST /hosts/ssh/update 需要 { key, newValue }");
    }

    // 先拿当前配置：一是把用户传入的键名映射成 v1 的真实指令名，二是取 Port 的旧值。
    // 读取失败就直接抛出（无法确认键名时盲发更新可能写坏 sshd_config）
    const current = await this.getConfig();
    // v1 的 conf 端点返回 sshd_config 全文（string），按文本解析；若上游改为对象也兼容
    const currentConf = current?.data ?? current ?? "";

    const results: any[] = [];
    for (const [rawKey, value] of entries) {
      const key = resolveKey(rawKey, currentConf);
      const body: Record<string, any> = { key, newValue: value };
      // Port 变更必须带 oldValue，后端用它更新防火墙规则与面板的 host 端口记录
      if (key === "Port") {
        const oldValue = sshDirective(currentConf, "Port");
        if (oldValue && oldValue !== String(value)) {
          body.oldValue = oldValue;
        }
      }
      results.push(await this.post("/api/v1/hosts/ssh/update", body));
    }

    // 逐项提交后汇总返回，保持调用方拿到 { code, data } 形状
    return { code: 200, message: "success", data: { updated: entries.map(([k]) => resolveKey(k, currentConf)), count: entries.length, results } };
  }

  /**
   * 按文件整篇替换 SSH 配置（v1: POST /hosts/ssh/conffile/update，dto.SSHConf = { file }）
   *
   * 注意：swagger.json 把该端点记成 /hosts/conffile/update，但实测该路径不可达
   * （会命中 HTML 安全入口守卫页）；v1.10 的真实路由是 /hosts/ssh/conffile/update
   * （见 backend/router/ro_host.go），故这里用带 /ssh 前缀的真实路径。
   */
  async updateConfigByFile(content: string): Promise<any> {
    return this.post("/api/v1/hosts/ssh/conffile/update", { file: content });
  }
}

/** 把 { Port: "2222", UseDNS: "no" } 或 { key, newValue } 统一成 [key, value][] */
function sshEntries(config: any): [string, string][] {
  if (!config || typeof config !== "object") {
    throw new Error("1Panel v1 的 SSH 配置更新需要传入 { key, newValue } 或字段对象，例如 { Port: \"2222\" }");
  }
  if (typeof config.key === "string" && config.key.length > 0) {
    const value = config.newValue ?? config.value;
    if (value === undefined || value === null) {
      throw new Error("1Panel v1 的 SSH 配置更新缺少 newValue（POST /hosts/ssh/update 的 DTO 为 { key, newValue }）");
    }
    return [[config.key, String(value)]];
  }
  return Object.entries(config)
    .filter(([k, v]) => k !== "oldValue" && v !== undefined && v !== null && typeof v !== "object")
    .map(([k, v]) => [k, String(v)] as [string, string]);
}

/** 键名大小写不敏感地映射到 sshd_config 的真实指令名（指令名区分大小写，写错会导致后端不生效） */
function resolveKey(rawKey: string, conf: string | Record<string, any>): string {
  const known = ["Port", "ListenAddress", "PasswordAuthentication", "PubkeyAuthentication", "PermitRootLogin", "UseDNS", "UsePAM"];
  if (known.includes(rawKey)) return rawKey;
  // 配置里实际出现过的键名优先（保留真实大小写）
  if (conf && typeof conf === "object" && Object.prototype.hasOwnProperty.call(conf, rawKey)) return rawKey;
  const hit = known.find((k) => k.toLowerCase() === rawKey.toLowerCase());
  if (hit) return hit;
  if (typeof conf === "string") {
    const present = known.find((k) => sshDirective(conf, k) !== undefined);
    if (present && present.toLowerCase() === rawKey.toLowerCase()) return present;
  } else {
    const objKey = Object.keys(conf ?? {}).find((k) => k.toLowerCase() === rawKey.toLowerCase());
    if (objKey) return objKey;
  }
  return rawKey;
}

/**
 * 从 sshd_config 全文里读某个指令的当前值（如 Port → "22"）。
 *
 * v1 的 GET /hosts/ssh/conf 返回的是纯文本配置，不是 dto.SSHInfo 对象，
 * 所以这里跟后端一样按行解析；被注释掉的指令不算。
 */
function sshDirective(conf: string | Record<string, any>, name: string): string | undefined {
  if (conf && typeof conf === "object") {
    const v = (conf as Record<string, any>)[name];
    return v === undefined || v === null ? undefined : String(v);
  }
  if (typeof conf !== "string") return undefined;
  for (const line of conf.split("\n")) {
    const item = line.trim();
    if (item.startsWith("#") || !item.startsWith(name)) continue;
    const rest = item.slice(name.length);
    // 必须是 "Name value" 形式，避免 Port 误匹配 PortForwarding
    if (!/^\s/.test(rest)) continue;
    return rest.trim() || undefined;
  }
  return undefined;
}
