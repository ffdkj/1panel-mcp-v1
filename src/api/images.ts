import { BaseAPI } from "./base.js";

/**
 * 1Panel v1.x 镜像 API 适配层
 *
 * 与原 v2 实现的语义差异：
 *  - 拉取：v1 字段是 imageName（不是 name）。
 *  - 删除：v1 是 { names: string[] } 批量删除（不是 { id }）。
 *  - 打标签：v1 是 { sourceID, targetName }。
 *  - build：v1 是 { dockerfile, from(=Dockerfile 所在目录), name }。
 *  - push：v1 必填 repoID（uint，传 0 会被校验拒绝），必须指定面板里已配置的镜像仓库。
 *  - save：v1 是 { tagName, path, name }（一次导出一个镜像到 <path>/<name>.tar）。
 */
export class ImageAPI extends BaseAPI {
  async list(): Promise<any> {
    return this.get("/api/v1/containers/image");
  }

  async listAll(): Promise<any> {
    return this.get("/api/v1/containers/image/all");
  }

  async search(): Promise<any> {
    return this.post("/api/v1/containers/image/search", { page: 1, pageSize: 100 });
  }

  async pull(name: string): Promise<any> {
    return this.post("/api/v1/containers/image/pull", { imageName: name });
  }

  /**
   * v1 的 dto.ImagePush 必填 { name, repoID, tagName }，且 repoID 是 uint + required
   * —— 传 0 会被 global.VALID 校验拒绝（v2 允许不带仓库）。
   * v1 的推送目标必须是面板里已配置的镜像仓库，因此：
   *  - 显式传了 repoID 就用它；
   *  - 没传时，若面板恰好只配置了 1 个仓库就直接用它；0 个或多个则抛错要求显式指定，
   *    避免把镜像推到错误的仓库。
   */
  async push(name: string, repoID?: number): Promise<any> {
    let targetRepoID = repoID;
    if (!targetRepoID) {
      const repos = await this.get("/api/v1/containers/repo");
      const list: any[] = repos?.data ?? [];
      if (list.length !== 1) {
        throw new Error(
          `1Panel v1 推送镜像必须指定镜像仓库（repoID 为必填且不能为 0）：当前面板已配置 ${list.length} 个仓库` +
            (list.length
              ? `（${list.map((item: any) => `${item.name}=${item.id}`).join(", ")}），请显式传入 repoID`
              : "，请先在「容器 → 仓库」中添加镜像仓库"),
        );
      }
      targetRepoID = list[0].id;
    }
    return this.post("/api/v1/containers/image/push", { name, repoID: targetRepoID, tagName: "latest" });
  }

  async remove(id: string): Promise<any> {
    return this.post("/api/v1/containers/image/remove", { names: [id] });
  }

  async build(dockerfile: string, name: string, path: string): Promise<any> {
    return this.post("/api/v1/containers/image/build", { dockerfile, from: path, name });
  }

  async tag(id: string, repo: string, tag: string): Promise<any> {
    return this.post("/api/v1/containers/image/tag", { sourceID: id, targetName: `${repo}:${tag}` });
  }

  /**
   * v1 的 dto.ImageSave 必填 { tagName, path, name }（v2 只需要 name）：
   * tagName=要导出的镜像引用，path=宿主机目录，name=文件名（服务端写 <path>/<name>.tar）。
   *  - path 默认用 1Panel 的临时目录 <数据目录>/tmp（v1 默认是 /opt/1panel/tmp）；
   *    若面板改了 base_dir 或该目录不存在，请显式传入 path。
   *  - v1 一次只导出一个镜像，所以按名字逐个导出，文件名由镜像引用转义而来。
   */
  async save(names: string[], path = "/opt/1panel/tmp"): Promise<any> {
    const results: any[] = [];
    for (const ref of names) {
      results.push(
        await this.post("/api/v1/containers/image/save", {
          tagName: ref,
          path,
          name: ref.replace(/[^A-Za-z0-9._-]/g, "_"),
        }),
      );
    }
    return results.length === 1 ? results[0] : { code: 200, message: "", data: results };
  }

  async load(path: string): Promise<any> {
    return this.post("/api/v1/containers/image/load", { path });
  }
}
