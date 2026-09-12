import { BaseAPI } from "./base.js";

/**
 * 1Panel v1.x 系统设置 API 适配层（v1 tag `System Setting`，共 29 个端点）
 *
 * 与原 v2 实现的语义差异：
 *  - 读取：v1 是 POST /settings/search（原实现用了 GET，v1 里 GET 该路径不存在，会命中前端守卫页）；
 *    返回 dto.SettingInfo（扁平 string 键值对）。
 *  - 更新：v1 是 POST /settings/update，body 是"单键"DTO dto.SettingUpdate = { key, value }（key 必填），
 *    一次只能写一项（后端 settingService.Update(key, value) 还会对
 *    MonitorStatus / MonitorInterval / ExpirationDays / BindDomain 等键做联动处理）。
 *    因此 update() 收到多字段对象时会拆成多次请求（v2 是一次性提交整对象）。
 */
export class SettingsAPI extends BaseAPI {
  /** 读取系统设置（v1: POST /settings/search，无请求体参数） */
  async getSettings(): Promise<any> {
    return this.post("/api/v1/settings/search", {});
  }

  /**
   * 更新系统设置。
   *
   * v2 提交 { ...任意字段 }；v1 只能逐键提交，故这里按键拆分。
   * 也兼容直接传 { key, value } 的单项写法。
   */
  async update(settings: any): Promise<any> {
    const entries = settingEntries(settings);
    if (entries.length === 0) {
      throw new Error("1Panel v1 的系统设置接口只接受单键更新：POST /settings/update 需要 { key, value }");
    }

    const results: any[] = [];
    for (const [key, value] of entries) {
      results.push(await this.post("/api/v1/settings/update", { key, value }));
    }

    // 逐项提交后汇总返回，保持调用方拿到 { code, data } 形状
    return { code: 200, message: "success", data: { updated: entries.map(([k]) => k), count: entries.length, results } };
  }
}

/** 把 { Language: "zh", Theme: "dark" } 或 { key, value } 统一成 [key, value][] */
function settingEntries(settings: any): [string, string][] {
  if (!settings || typeof settings !== "object") return [];
  if (typeof settings.key === "string" && settings.key.length > 0) {
    return [[settings.key, String(settings.value ?? "")]];
  }
  return Object.entries(settings)
    .filter(([, v]) => v !== undefined && v !== null && typeof v !== "object")
    .map(([k, v]) => [k, String(v)] as [string, string]);
}
