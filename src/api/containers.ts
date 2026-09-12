import { BaseAPI } from "./base.js";

/**
 * 1Panel v1.x 容器 API 适配层
 *
 * 与原 v2 实现的语义差异（不是改前缀就能解决的）：
 *  - 生命周期操作：v1 走 /containers/operate，body 是 { names: string[], operation }，
 *    operation ∈ up|start|stop|restart|kill|pause|unpause|remove；v2 才是 { id, operation }。
 *  - 删除容器：v1 没有 /containers/del，用 operate + operation:"remove"。
 *  - 容器详情：v1 /containers/info 必填 name（不是 id）。
 *  - inspect：v1 必填 { id, type }。
 *  - 日志：v1 是 GET /containers/search/log?container=&tail=（查询参数），不是 POST body。
 *  - 状态：v1 是 GET /containers/docker/status，不是 /containers/status。
 */
export class ContainerAPI extends BaseAPI {
  // List operations
  async list(): Promise<any> {
    return this.post("/api/v1/containers/search", { page: 1, pageSize: 100, state: "all", orderBy: "name", order: "ascending" });
  }

  async listSimple(): Promise<any> {
    return this.post("/api/v1/containers/list", {});
  }

  /** v1 无 byimage 端点，退回全量查询后本地过滤 */
  async listByImage(image: string): Promise<any> {
    const res = await this.post("/api/v1/containers/search", { page: 1, pageSize: 500, state: "all", orderBy: "name", order: "ascending" });
    const items = (res?.data?.items ?? []).filter((c: any) => (c.image ?? "").includes(image));
    return { ...res, data: { total: items.length, items } };
  }

  // Info operations
  async get(id: string): Promise<any> {
    return this.post("/api/v1/containers/info", { name: id });
  }

  async inspect(id: string): Promise<any> {
    return this.post("/api/v1/containers/inspect", { id, type: "container" });
  }

  async getStats(id: string): Promise<any> {
    return super.get(`/api/v1/containers/stats/${id}`);
  }

  async getStatus(): Promise<any> {
    return super.get("/api/v1/containers/docker/status");
  }

  /** v1 无 users 端点，从 inspect 结果里取 Config.User */
  async getUsers(name: string): Promise<any> {
    const res = await this.inspect(name);
    return { code: 200, message: "", data: res?.data?.Config?.User ?? "" };
  }

  // Lifecycle operations —— v1 统一走 operate + names[]
  private operate(id: string, operation: string): Promise<any> {
    return this.post("/api/v1/containers/operate", { names: [id], operation });
  }

  async start(id: string): Promise<any> { return this.operate(id, "start"); }
  async stop(id: string): Promise<any> { return this.operate(id, "stop"); }
  async restart(id: string): Promise<any> { return this.operate(id, "restart"); }
  async pause(id: string): Promise<any> { return this.operate(id, "pause"); }
  async unpause(id: string): Promise<any> { return this.operate(id, "unpause"); }
  async kill(id: string): Promise<any> { return this.operate(id, "kill"); }

  // Management operations
  async create(config: any): Promise<any> {
    return this.post("/api/v1/containers", config);
  }

  async update(id: string, config: any): Promise<any> {
    return this.post("/api/v1/containers/update", { containerID: id, ...config });
  }

  async rename(id: string, name: string): Promise<any> {
    return this.post("/api/v1/containers/rename", { name: id, newName: name });
  }

  async upgrade(id: string, image: string): Promise<any> {
    return this.post("/api/v1/containers/upgrade", { name: id, image });
  }

  /** v1 删除容器 = operate + operation:"remove" */
  async remove(id: string): Promise<any> {
    return this.operate(id, "remove");
  }

  /** v1 的 dto.ContainerPrune 必填 pruneType（container|image|volume|network|buildcache），
   *  空 body 会被 global.VALID 校验拒绝；面板 UI 的"清理容器"按钮发的就是
   *  { pruneType: "container", withTagAll: false }。 */
  async prune(): Promise<any> {
    return this.post("/api/v1/containers/prune", { pruneType: "container", withTagAll: false });
  }

  // Logs —— v1 外部 API 走 POST /containers/download/log（返回纯文本日志）
  // 注：UI 用的 GET /containers/search/log 是 WebSocket/SSE 流，裸 GET 会返回 400，不适合 API 调用
  async getLogs(id: string, tail = 100): Promise<any> {
    return this.post("/api/v1/containers/download/log", { container: id, containerType: "container", tail });
  }

  async cleanLog(id: string): Promise<any> {
    return this.post("/api/v1/containers/clean/log", { name: id });
  }

  // Commit
  async commit(id: string, repo: string, tag: string): Promise<any> {
    return this.post("/api/v1/containers/commit", { containerID: id, newImageName: `${repo}:${tag}` });
  }
}
