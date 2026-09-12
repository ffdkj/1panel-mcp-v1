import { BaseAPI } from "./base.js";

/** v1 /hosts/firewall/search 必须显式带 type，没有“全部”取值 */
type FirewallRuleType = "port" | "forward" | "address";

/**
 * 1Panel v1.x 防火墙 API 适配层
 *
 * 与原 v2 实现的语义差异（v2 用的 /toolbox/firewall* 在 v1 完全不存在）：
 *  - 命名空间：v1 防火墙挂在 /hosts/firewall/*（共 10 个端点），不在 /toolbox 下。
 *  - 查询：/hosts/firewall/search 必填 { page, pageSize, type }，type 只认
 *    port（端口规则）/ forward（端口转发）/ address（IP 规则）三种，没有“一次查全部”的取值，
 *    所以 listRules() 是“按 type 查多次再本地合并”（见该方法的注释）。
 *  - 创建：v1 没有通用创建端点，按规则形状拆到 /port、/ip、/forward 三个端点。
 *  - 删除：v1 没有 /hosts/firewall/del，也不存在“按 id 删除”——规则直接来自 iptables/ufw
 *    的实时列表（FireInfo 结构体里没有 id 字段），删除是把 operation:"remove" 连同完整规则
 *    字段提交给 /port 或 /ip（v1 前端就是这么做的）。只有 v2 的 DTO 里才有 id。
 *  - v1 另外 6 个端点（/base、/operate、/update/port、/update/addr、/update/description、/batch）
 *    在移植前的 v2 模块里没有对应方法，本次未接入。
 */
export class FirewallAPI extends BaseAPI {
  /** v1 的 search 必须带 type，这里按类型分别查询 */
  private searchByType(type: FirewallRuleType, page: number, pageSize: number): Promise<any> {
    return this.post("/api/v1/hosts/firewall/search", { page, pageSize, type });
  }

  /**
   * 列出防火墙规则。
   * v1 的 search 必须指定 type，所以这里按类型逐个查询后合并，并给每条规则补一个
   * type 字段（port/address/forward），否则调用方无法区分异构的规则条目。
   *
   * 不传 type 时只查 port + address（这两类才是常规的「防火墙规则」）；
   * forward 需要显式指定 type="forward" 才查——因为 v1 的 ufw 实现里
   * ListForward() 会先调 EnableForward() 建 1PANEL 的 nat 链并 reload（见
   * backend/utils/firewall/client/ufw.go），把这种副作用藏在一次“列表查询”里并不合适。
   */
  async listRules(type?: FirewallRuleType): Promise<any> {
    const types: FirewallRuleType[] = type ? [type] : ["port", "address"];
    const results = await Promise.all(types.map((t) => this.searchByType(t, 1, 100)));
    const items = results.flatMap((res, index) =>
      (res?.data?.items ?? []).map((item: any) => ({ ...item, type: types[index] })),
    );
    return { code: 200, message: "", data: { total: items.length, items } };
  }

  /**
   * 创建防火墙规则。
   * v1 没有通用创建端点，按规则形状路由：
   *  - 带 targetPort/targetIP → /hosts/firewall/forward（ForwardRuleOperate）
   *  - 带 port               → /hosts/firewall/port（PortRuleOperate，address 是规则来源地址）
   *  - 只有 address          → /hosts/firewall/ip（AddrRuleOperate）
   * v1 的 operation/protocol/strategy 均为必填枚举，这里补默认值 add / tcp / accept。
   */
  async createRule(rule: any): Promise<any> {
    const r = rule ?? {};
    const operation = r.operation ?? "add";

    if (r.targetPort !== undefined || r.targetIP !== undefined) {
      if (r.port === undefined) {
        throw new Error("创建端口转发规则需要 port 与 targetPort（v1 /hosts/firewall/forward 的 rules[].port/targetPort 均必填）");
      }
      return this.post("/api/v1/hosts/firewall/forward", {
        forceDelete: r.forceDelete ?? false,
        rules: [
          {
            operation,
            port: String(r.port),
            protocol: r.protocol ?? "tcp",
            targetIP: r.targetIP ?? "",
            targetPort: String(r.targetPort ?? ""),
          },
        ],
      });
    }

    if (r.port !== undefined) {
      return this.post("/api/v1/hosts/firewall/port", {
        operation,
        port: String(r.port),
        protocol: r.protocol ?? "tcp",
        strategy: r.strategy ?? "accept",
        address: r.address ?? "",
        description: r.description ?? "",
      });
    }

    if (r.address !== undefined) {
      return this.post("/api/v1/hosts/firewall/ip", {
        operation,
        address: r.address,
        strategy: r.strategy ?? "accept",
        description: r.description ?? "",
      });
    }

    throw new Error(
      "无法识别规则类型：v1 需要 port（端口规则）、address（IP 规则）或 port+targetPort（端口转发）字段，收到 " +
        JSON.stringify(rule),
    );
  }

  /**
   * 删除端口规则。
   * v1 的删除 = 同一个 /hosts/firewall/port 端点 + operation:"remove"，
   * 且必须带上规则的 port/protocol/strategy（可选 address），没有 id 可用。
   */
  async removePortRule(rule: { port: string | number; protocol?: string; strategy?: string; address?: string }): Promise<any> {
    return this.post("/api/v1/hosts/firewall/port", {
      operation: "remove",
      port: String(rule.port),
      protocol: rule.protocol ?? "tcp",
      strategy: rule.strategy ?? "accept",
      address: rule.address ?? "",
    });
  }

  /**
   * 删除 IP 规则：/hosts/firewall/ip + operation:"remove" + address/strategy。
   */
  async removeAddrRule(rule: { address: string; strategy?: string }): Promise<any> {
    return this.post("/api/v1/hosts/firewall/ip", {
      operation: "remove",
      address: rule.address,
      strategy: rule.strategy ?? "accept",
    });
  }

  /**
   * v1 不支持按 id 删除防火墙规则（v2 专有），这里明确抛错。
   * 原因：v1 没有 /hosts/firewall/del，规则列表来自 iptables/ufw 实时结果且不带 id，
   * 删除只能提交 operation:"remove" + 完整规则字段（见 removePortRule / removeAddrRule）。
   */
  async removeRule(id: number): Promise<any> {
    throw new Error(
      `1Panel v1 不支持按 id 删除防火墙规则（v2 专有）: /hosts/firewall/del 不存在；` +
        `v1 规则不带 id，需改用 removePortRule({ port, protocol, strategy }) 或 removeAddrRule({ address, strategy })。收到 id=${id}`,
    );
  }
}
