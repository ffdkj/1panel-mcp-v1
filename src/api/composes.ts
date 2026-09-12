import { BaseAPI } from "./base.js";

/**
 * 1Panel v1.x Compose API 适配层
 *
 * 与原 v2 实现的语义差异（不是把 /api/v2 换成 /api/v1 就能解决的）：
 *  - 项目标识：v1 用 **name（字符串）** 标识 compose 项目，没有 v2 的数值 id，
 *    所以所有方法的首参都按 name 使用（类型保留 number 是为了兼容 client.ts 的既有调用签名）。
 *  - 操作：v1 只有 POST /containers/compose/operate，body = { name, operation, path, withFile }，
 *    operation 枚举只有 up|start|stop|down|delete（**没有 restart**）。
 *  - 关键：v1 服务端对除 delete 以外的操作会先 os.Stat(path) 校验，
 *    path 必须是 docker-compose.yml 的完整路径，否则报 "load file with path  failed"。
 *    因此这里统一先用 POST /containers/compose/search 按 name 反查 path。
 *  - 删除：v1 没有 /containers/compose/del，走 operate 的 operation:"delete"。
 *  - 更新：v1 的 ComposeUpdate 必填 { name, path, content }（v2 只有 id+content），
 *    且写完文件后服务端会自己 docker-compose up（相当于 v2 的 update + 重启）。
 *  - 创建：v1 的 ComposeCreate 必填 from ∈ edit|path|template，内联 YAML 的字段名是 file（v2 叫 content）。
 *  - 查看 env：v1 没有 /containers/compose/env，env 由 search 结果逐条返回（服务端读项目目录下的 1panel.env）。
 *  - 清理日志：v1 没有 /containers/compose/clean/log，且无等价端点 —— 抛错（见 cleanLog）。
 */
export class ComposeAPI extends BaseAPI {
  private static readonly SEARCH = "/api/v1/containers/compose/search";
  private static readonly OPERATE = "/api/v1/containers/compose/operate";

  /**
   * v1 的 /compose/test 与创建共用 ComposeCreate DTO：from 必填，name 也参与
   * "项目是否已存在"校验与落盘路径计算（from=edit 时服务端会把内容写到
   * <1Panel 数据目录>/docker/compose/<name>/docker-compose.yml，再执行 docker-compose config）。
   * MCP 的 test_compose 工具只传 content，所以这里用一个固定占位项目名。
   * 该目录不会被 docker 识别为 compose 项目（没有容器、1Panel 也没有数据库记录），不会出现在项目列表里。
   */
  private static readonly TEST_COMPOSE_NAME = "1panel-mcp-test";

  async list(): Promise<any> {
    return this.post(ComposeAPI.SEARCH, { page: 1, pageSize: 100 });
  }

  async create(name: string, content: string, path?: string): Promise<any> {
    // v1 强制 from 枚举：path=用宿主机上已存在的 compose 文件创建（服务端会忽略 file，并用文件所在目录名覆盖 name）；
    // edit=用内联 YAML 创建（内容字段是 file）。v2 的 { name, content, path } 在 v1 必须拆成这两种形态。
    if (path) {
      return this.post("/api/v1/containers/compose", { from: "path", name, path });
    }
    return this.post("/api/v1/containers/compose", { from: "edit", name, file: content });
  }

  /**
   * v1 没有 /containers/compose/del：删除 = operate + operation:"delete"。
   * 语义（v1 服务端 ComposeOperation）：带 path 时先 docker-compose down，
   * 再按 withFile 决定是否 RemoveAll(项目目录)，最后删 1Panel 的数据库记录；
   * path 为空时只删数据库记录。
   * withFile 默认 false（与面板 UI 的默认值一致），避免不可逆地删除 compose 目录。
   */
  async remove(name: number | string, withFile = false): Promise<any> {
    const composeName = String(name);
    const item = await this.findCompose(composeName);
    if (!item) {
      throw new Error(`未找到名为 "${composeName}" 的 compose 项目（1Panel v1 用 name 标识 compose）`);
    }
    const body: any = { name: composeName, operation: "delete", withFile };
    // 没有 path 时 v1 只删数据库记录（不会 down 容器、也不会删文件），这是 v1 对孤儿项目的既有行为
    if (item.path) body.path = item.path;
    return this.post(ComposeAPI.OPERATE, body);
  }

  async start(name: number | string): Promise<any> {
    return this.operate(name, "start");
  }

  async stop(name: number | string): Promise<any> {
    return this.operate(name, "stop");
  }

  /**
   * v1 的 operation 枚举没有 restart（up|start|stop|down|delete），用 stop + up 组合等价实现：
   * 先停掉现有容器，再用 up 重新拉起（up 就是面板"启动"按钮的语义，
   * 容器尚未创建时能创建、配置/镜像有变化时按需重建，不像 start 那样在无容器时报错）。
   */
  async restart(name: number | string): Promise<any> {
    const target = await this.resolveTarget(name);
    await this.post(ComposeAPI.OPERATE, { ...target, operation: "stop" });
    return this.post(ComposeAPI.OPERATE, { ...target, operation: "up" });
  }

  async update(name: number | string, content: string): Promise<any> {
    // v1 ComposeUpdate 必填 { name, path, content }：v2 只有 id+content，path 需要按 name 反查
    const composeName = String(name);
    const target = await this.resolveTarget(composeName);
    return this.post("/api/v1/containers/compose/update", {
      name: composeName,
      path: target.path,
      content,
    });
  }

  async test(content: string): Promise<any> {
    return this.post("/api/v1/containers/compose/test", {
      from: "edit",
      name: ComposeAPI.TEST_COMPOSE_NAME,
      file: content,
    });
  }

  /**
   * v1 没有 /containers/compose/env：compose 的 env 由 search 结果逐条返回
   * （服务端 loadEnv 读取项目目录下的 1panel.env，字段名 env: string[]），所以用 search 反查取值。
   */
  async getEnv(name: number | string): Promise<any> {
    const composeName = String(name);
    const item = await this.findCompose(composeName);
    if (!item) {
      throw new Error(`未找到名为 "${composeName}" 的 compose 项目（1Panel v1 用 name 标识 compose）`);
    }
    return { code: 200, message: "", data: item.env ?? [] };
  }

  /**
   * v1 没有等价端点，按规约抛错：
   *  - /containers/compose/clean/log 在 v1 的 router 里未注册（已对 v1.10.34 实测：该路径返回 HTML 守卫页）。
   *  - 唯一相近的 /containers/clean/log 是按**容器名** inspect 并清空该容器的 docker 日志文件，
   *    对 compose 项目名无效，不能当作等价实现。
   */
  async cleanLog(name: number | string): Promise<any> {
    throw new Error(
      `1Panel v1 不支持 compose 日志清理（v2 专有端点 /containers/compose/clean/log 在 v1 未注册）：` +
        `请先用 list_containers 找到 compose "${name}" 下的容器，再对每个容器调用 clean_container_log`,
    );
  }

  /** v1 的启停/更新都必须带 docker-compose.yml 的完整路径，而 name 反查是唯一途径 */
  private async resolveTarget(name: number | string): Promise<{ name: string; path: string }> {
    const composeName = String(name);
    const item = await this.findCompose(composeName);
    if (!item) {
      throw new Error(`未找到名为 "${composeName}" 的 compose 项目（1Panel v1 用 name 标识 compose）`);
    }
    if (!item.path) {
      throw new Error(
        `compose "${composeName}" 没有返回 path，而 1Panel v1 的 operate/update 需要 docker-compose.yml 的完整路径，无法执行`,
      );
    }
    return { name: composeName, path: item.path };
  }

  /**
   * 按 name 精确反查 compose 条目（search 的 info 是模糊匹配，必须再比对一次 name，
   * 否则可能对另一个项目执行操作）。返回条目含 path / env 等字段。
   */
  private async findCompose(name: string): Promise<any | undefined> {
    const res = await this.post(ComposeAPI.SEARCH, { page: 1, pageSize: 100, info: name });
    const items: any[] = res?.data?.items ?? [];
    return items.find((item: any) => item?.name === name);
  }

  private async operate(name: number | string, operation: string): Promise<any> {
    const target = await this.resolveTarget(name);
    return this.post(ComposeAPI.OPERATE, { ...target, operation });
  }
}
