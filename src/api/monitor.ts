import { BaseAPI } from "./base.js";

export interface MonitorDataRequest {
  /** 开始时间（v1 要求 RFC3339，如 2026-09-13T00:00:00+08:00；不传默认取最近 24h） */
  startTime?: string;
  /** 结束时间（同上） */
  endTime?: string;
  /** 监控项：v1 必填，all|cpu|memory|load|io|network（缺省 "all"） */
  param?: string;
}

/** v1 dto.MonitorSearch.param 的 oneof 取值（真实面板校验会拒绝其他值） */
const MONITOR_PARAMS = ["all", "cpu", "memory", "load", "io", "network"];

/** v1 没有独立的监控设置端点，监控配置是 /settings 里的这三个 key */
const MONITOR_SETTING_KEYS = ["monitorStatus", "monitorInterval", "monitorStoreDays"];

/**
 * 1Panel v1.x 监控 API 适配层
 *
 * 原 v2 实现的 /api/v1/monitor/data|setting|clean 在 v1 都不存在，
 * 真实端点是 `/api/v1/hosts/monitor/*`（swagger tag `Monitor`，只有 2 个端点）：
 *  - 取数据：POST /hosts/monitor/search，body dto.MonitorSearch
 *            { param 必填, startTime?, endTime?, info? }，返回 dto.MonitorData[]
 *            （param 为 "all" 时返回 base/io/network 三组）。
 *            时间必须是 RFC3339；实测传 "2026-09-13 00:00:00" 会被 Go 解析器拒绝。
 *  - 清数据：POST /hosts/monitor/clean（无请求体）
 *
 * v1 没有监控设置端点：monitorStatus / monitorInterval / monitorStoreDays 是系统设置项，
 * 读写都走 /settings/search 与 /settings/update，所以 getSetting/updateSetting 在此改写。
 */
export class MonitorAPI extends BaseAPI {
  /**
   * 获取监控数据
   * v1 必填 param，缺省用 "all"；时间不传时给最近 24h（面板需要时间窗才会返回数据点）
   */
  async getData(params: MonitorDataRequest = {}): Promise<any> {
    const param = params.param ?? "all";
    if (!MONITOR_PARAMS.includes(param)) {
      throw new Error(`1Panel v1 监控 param 只支持 ${MONITOR_PARAMS.join("|")}，收到: ${param}`);
    }
    const endTime = params.endTime ?? new Date().toISOString();
    const startTime = params.startTime ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    return this.post("/api/v1/hosts/monitor/search", { param, startTime, endTime });
  }

  /**
   * 获取监控设置
   * v1 无 /monitor/setting，从 /settings/search 里挑出监控相关的三个 key
   */
  async getSetting(): Promise<any> {
    const res: any = await this.post("/api/v1/settings/search", {});
    const all = res?.data ?? {};
    const data: Record<string, any> = {};
    for (const key of MONITOR_SETTING_KEYS) {
      data[key] = all[key];
    }
    return { ...res, data };
  }

  /**
   * 更新监控设置
   * v1 无 /monitor/setting，改为逐项调用 /settings/update（dto.SettingUpdate = { key, value }）；
   * 只允许监控相关的三个 key，避免误改其他系统设置
   */
  async updateSetting(setting: any): Promise<any> {
    if (!setting || typeof setting !== "object") {
      throw new Error("1Panel v1 更新监控设置需要对象，形如 { monitorStatus|monitorInterval|monitorStoreDays: value }");
    }
    const keys = Object.keys(setting).filter((k) => setting[k] !== undefined);
    const unknown = keys.filter((k) => !MONITOR_SETTING_KEYS.includes(k));
    if (unknown.length > 0) {
      throw new Error(
        `1Panel v1 的监控设置只有 ${MONITOR_SETTING_KEYS.join("|")}，不支持: ${unknown.join(", ")}`,
      );
    }
    if (keys.length === 0) {
      throw new Error("1Panel v1 更新监控设置未提供任何键");
    }
    let last: any = null;
    for (const key of keys) {
      last = await this.post("/api/v1/settings/update", { key, value: String(setting[key]) });
    }
    return last;
  }

  /**
   * 清理监控数据
   * v1 是 POST /hosts/monitor/clean（无请求体），不是 /monitor/clean
   */
  async cleanData(): Promise<any> {
    return this.post("/api/v1/hosts/monitor/clean", {});
  }
}
