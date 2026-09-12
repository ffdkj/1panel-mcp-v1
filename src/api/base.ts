import { OnePanelConfig } from "../types/config.js";
import { generateToken } from "../utils/auth.js";

export class BaseAPI {
  protected config: OnePanelConfig;

  constructor(config: OnePanelConfig) {
    this.config = { protocol: "http", ...config };
  }

  protected async request(path: string, options: RequestInit = {}): Promise<any> {
    const { token, timestamp } = generateToken(this.config.apiKey);
    const url = `${this.config.protocol}://${this.config.host}:${this.config.port}${path}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        "1Panel-Token": token,
        "1Panel-Timestamp": timestamp,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`1Panel API error: ${response.status} ${response.statusText}`);
    }

    const text = await response.text();

    // 路由未命中 / 安全入口拦截时，1Panel 返回 HTML 守卫页而不是 JSON
    if (text.startsWith("<")) {
      throw new Error(`1Panel 返回 HTML 而非 JSON（路径不存在或安全入口拦截）: ${text.slice(0, 80)}...`);
    }

    // 部分端点（如容器日志）直接返回纯文本，不套 JSON 信封
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      return text;
    }

    // 1Panel 的业务错误是 HTTP 200 + body.code，原实现会把它当成成功
    if (data && typeof data === "object" && typeof data.code === "number" && data.code !== 200) {
      throw new Error(`1Panel API code=${data.code}: ${data.message}`);
    }

    return data;
  }

  protected post(path: string, body: any): Promise<any> {
    return this.request(path, { method: "POST", body: JSON.stringify(body) });
  }

  protected get(path: string): Promise<any> {
    return this.request(path, { method: "GET" });
  }
}
