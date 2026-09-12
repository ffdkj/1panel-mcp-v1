import { BaseAPI } from "./base.js";

export interface Fail2BanOperateRequest {
  /**
   * 操作：start / stop / restart。
   * v1 后端（utils/toolbox/fail2ban.go）实际还支持 enable / disable / reload，一并放开。
   */
  operation: "start" | "stop" | "restart" | "enable" | "disable" | "reload";
}

/**
 * /toolbox/fail2ban/operate/sshd 的真实请求体。
 *
 * 注意：v1（v1.10.34-lts 二进制实测）该端点绑定的是 dto.Fail2BanSet
 *   { ips: string[], operate: "banned" | "ignore" }
 * 语义是「把 IP 列表加入 sshd jail 的黑名单（重新封禁）或忽略名单（白名单）」，
 * 而不是“启动/停止 sshd 防护”。swagger 上标注的 dto.Operate 是过期注解。
 */
export interface Fail2BanSSHOperateRequest {
  /** banned = 重新封禁这些 IP；ignore = 加入 ignoreip 忽略名单 */
  operate?: "banned" | "ignore";
  /** 目标 IP 列表，可为单个 */
  ips?: string[];
  /**
   * @deprecated v2 遗留字段。v1 该端点不接受 operation，传了会 400（operate 必填且枚举 banned/ignore）。
   * 需要启停整个 fail2ban 服务请用 operate() → /toolbox/fail2ban/operate。
   */
  operation?: "start" | "stop" | "restart";
}

export interface Fail2BanUpdateRequest {
  /** 配置键：port | bantime | findtime | maxretry | banaction | logpath（v1 枚举，必填） */
  key: string;
  /** 配置值 */
  value: string;
}

export interface Fail2BanSearchRequest {
  /** v1 必填：banned（已封禁）/ ignore（忽略名单） */
  status?: "banned" | "ignore";
  /** v1 该端点一次性返回全部 IP（不支持分页），这两个字段仅为兼容旧签名保留，不会发送 */
  page?: number;
  pageSize?: number;
}

export class Fail2BanAPI extends BaseAPI {
  /**
   * 获取 Fail2ban 基础信息
   */
  async getBaseInfo(): Promise<any> {
    return this.request("/api/v1/toolbox/fail2ban/base", { method: "GET" });
  }

  /**
   * 获取 Fail2ban 配置（v1 固定读取 /etc/fail2ban/jail.local，无参数）
   */
  async getConf(): Promise<any> {
    return this.request("/api/v1/toolbox/fail2ban/load/conf", { method: "GET" });
  }

  /**
   * 操作 Fail2ban (启动/停止/重启)
   */
  async operate(params: Fail2BanOperateRequest): Promise<any> {
    return this.post("/api/v1/toolbox/fail2ban/operate", params);
  }

  /**
   * 操作 Fail2ban SSH。
   *
   * v1/v2 的 /toolbox/fail2ban/operate/sshd 都只做「封禁/忽略 IP 列表」（dto.Fail2BanSet），
   * 没有“启停 sshd 防护”这个能力，所以 v2 的 { operation: "start" } 在 v1 上必然失败：
   * 这里在发出请求前就抛错，避免落到后端只返回一句参数校验失败。
   * v1 也没有等价端点（整个 fail2ban 的启停走 operate()）。
   */
  async operateSSH(params: Fail2BanSSHOperateRequest): Promise<any> {
    const p: Fail2BanSSHOperateRequest = params ?? {};
    if (p.operate !== "banned" && p.operate !== "ignore") {
      throw new Error(
        `1Panel v1 的 /toolbox/fail2ban/operate/sshd 只支持 { ips: string[], operate: "banned" | "ignore" }（把 IP 加入/移出 sshd 黑名单或忽略名单），` +
          `不接受 { operation }（v2 遗留写法${p.operation ? `：${p.operation}` : ""}）；启停 fail2ban 服务请用 operate({ operation: "start" | "stop" | "restart" })`,
      );
    }
    return this.post("/api/v1/toolbox/fail2ban/operate/sshd", { ips: p.ips ?? [], operate: p.operate });
  }

  /**
   * 搜索被封禁的 IP 列表。
   * v1 必填 status（banned/ignore），且一次返回全部 IP（无 page/pageSize），故默认 banned。
   */
  async searchBannedIPs(params: Fail2BanSearchRequest = {}): Promise<any> {
    return this.post("/api/v1/toolbox/fail2ban/search", { status: params.status ?? "banned" });
  }

  /**
   * 更新 Fail2ban 配置
   */
  async updateConf(params: Fail2BanUpdateRequest): Promise<any> {
    return this.post("/api/v1/toolbox/fail2ban/update", params);
  }

  /**
   * 通过文件更新 Fail2ban 配置。
   * v1 的请求体字段是 file（dto.UpdateByFile），不是 v2 的 content。
   */
  async updateConfByFile(content: string): Promise<any> {
    return this.post("/api/v1/toolbox/fail2ban/update/byconf", { file: content });
  }
}
