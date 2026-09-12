import { BaseAPI } from "./base.js";

/**
 * 1Panel v1.x 主机设备（Device tag）API 适配层
 *
 * 原 v2 实现的端点前缀是 `/api/v1/host/tool/*`，v1（1.10.34-lts）实际注册在
 * `/api/v1/toolbox/device/*`（swagger tag `Device`，11 个端点，已对真实面板实测）。
 * 逐条对应：
 *  - GET  /host/tool/device          → POST /toolbox/device/base        （v1 只支持 POST）
 *  - POST /host/tool/dns             → POST /toolbox/device/check/dns   （body dto.SettingUpdate）
 *  - POST /host/tool/update          → POST /toolbox/device/update/conf （body dto.SettingUpdate）
 *  - POST /host/tool/update/byconf   → POST /toolbox/device/update/byconf（body { name, file }）
 *  - POST /host/tool/update/host     → POST /toolbox/device/update/host （body { key, value }）
 *  - POST /host/tool/update/passwd   → POST /toolbox/device/update/passwd（body dto.ChangePasswd）
 *  - POST /host/tool/update/swap     → POST /toolbox/device/update/swap （body dto.SwapHelper）
 *
 * 关键字段差异：v1 的设备参数更新不是「提交一个 conf 对象」，而是**单键更新**
 * （dto.SettingUpdate = { key, value }），所以 update(conf) 的语义被收窄为
 * 「一次改一个键」，对象形式会抛错而不是静默拼错 body。
 */
export class DeviceAPI extends BaseAPI {
  /**
   * 获取设备基础信息
   * v1 是 POST /toolbox/device/base（无请求体），不是 GET /host/tool/device
   */
  async getBaseInfo(): Promise<any> {
    return this.post("/api/v1/toolbox/device/base", {});
  }

  /**
   * 检查 DNS 配置
   * v1 dto.SettingUpdate 必填 key（DNS 场景即 "dns"），value 为待校验的 DNS 内容
   */
  async checkDNS(value = "", key = "dns"): Promise<any> {
    return this.post("/api/v1/toolbox/device/check/dns", { key, value });
  }

  /**
   * 更新设备配置
   * v1 走 dto.SettingUpdate 单键更新：conf 必须是 { key, value }（或 { key, newValue }）
   */
  async update(conf: any): Promise<any> {
    if (!conf || typeof conf !== "object" || typeof conf.key !== "string" || conf.key === "") {
      throw new Error(
        "1Panel v1 的设备更新只支持单键更新：POST /toolbox/device/update/conf 需要 { key, value }" +
          "（v2 的整对象 conf 语义在 v1 不存在）",
      );
    }
    const value = conf.value !== undefined ? conf.value : conf.newValue;
    return this.post("/api/v1/toolbox/device/update/conf", { key: conf.key, value });
  }

  /**
   * 通过文件内容更新设备配置
   * v1 是 POST /toolbox/device/update/byconf（dto.UpdateByNameAndFile = { name, file }），
   * v2 的 { content } 字段名在 v1 不存在
   */
  async updateByFile(content: string, name = "/etc/hosts"): Promise<any> {
    return this.post("/api/v1/toolbox/device/update/byconf", { name, file: content });
  }

  /**
   * 更新 hosts
   * v1 是 POST /toolbox/device/update/host，body 是 { key, value }（hosts 条目 ip → 主机名），
   * v2 的整段 hosts 文本会按 "ip 主机名" 解析后提交
   */
  async updateHosts(hosts: string): Promise<any> {
    const [ip, ...rest] = String(hosts ?? "").trim().split(/\s+/);
    if (!ip) {
      throw new Error("1Panel v1 更新 hosts 需要单条记录（{ key: ip, value: 主机名 }），未提供内容");
    }
    return this.post("/api/v1/toolbox/device/update/host", { key: ip, value: rest.join(" ") });
  }

  /**
   * 更新面板密码
   * v1 dto.ChangePasswd = { passwd, user }：user 是面板用户（默认 1panel），passwd 是新密码；
   * v2 的 { oldPass, newPass } 字段名在 v1 不存在（v1 校验的是当前登录态，不收旧密码）
   */
  async updatePassword(oldPass: string, newPass: string, user = "1panel"): Promise<any> {
    return this.post("/api/v1/toolbox/device/update/passwd", { user, passwd: newPass });
  }

  /**
   * 更新 swap
   * v1 dto.SwapHelper 必填 path（另可选 isNew/size/used）
   */
  async updateSwap(swap: any): Promise<any> {
    if (!swap || typeof swap !== "object" || !swap.path) {
      throw new Error("1Panel v1 更新 swap 需要 dto.SwapHelper：{ path, isNew?, size?, used? }");
    }
    return this.post("/api/v1/toolbox/device/update/swap", swap);
  }

  /**
   * 列出时区选项（v1 新增能力：GET /toolbox/device/zone/options）
   */
  async listTimeZones(): Promise<any> {
    return super.get("/api/v1/toolbox/device/zone/options");
  }
}
