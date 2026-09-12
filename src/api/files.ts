import { BaseAPI } from "./base.js";

export interface FileInfo {
  name: string;
  path: string;
  size: number;
  isDir: boolean;
  isSymlink: boolean;
  mode: string;
  user: string;
  group: string;
  modTime: string;
}

export interface CompressRequest {
  /** 目标目录路径 */
  dst: string;
  /** 要压缩的文件路径列表 */
  files: string[];
  /** 压缩包名称 */
  name: string;
  /** 是否替换已存在的文件 */
  replace?: boolean;
  /** 压缩密码 (可选) */
  secret?: string;
  /** 压缩类型: zip, tar, tar.gz */
  type: "zip" | "tar" | "tar.gz";
}

export interface DecompressRequest {
  /** 解压目标目录 */
  dst: string;
  /** 压缩包路径 */
  path: string;
  /** 解压密码 (可选) */
  secret?: string;
  /** 压缩类型: zip, tar, tar.gz */
  type: "zip" | "tar" | "tar.gz";
}

export interface MoveRequest {
  /** 源文件/目录路径 */
  from: string;
  /** 目标路径 */
  to: string;
  /** 是否覆盖 */
  overwrite?: boolean;
  /** v1 扩展：移动类型，cut=剪切（默认，v1 的"移动"），copy=复制 */
  type?: "cut" | "copy";
}

export interface RenameRequest {
  /** 原文件路径（完整路径，v1 的 oldName） */
  path: string;
  /** 新名称（仅文件名，不是完整路径） */
  name: string;
}

export interface ChmodRequest {
  /** 权限模式（八进制字符串，如 "755"、"644"、"0755"） */
  mode: string;
  /** 文件/目录路径 */
  path: string;
  /** 是否递归修改子目录 */
  sub?: boolean;
}

export interface ChownRequest {
  /** 所属组 */
  group: string;
  /** 文件/目录路径 */
  path: string;
  /** 是否递归修改子目录 */
  sub?: boolean;
  /** 所属用户 */
  user: string;
}

export interface UploadRequest {
  /** 目标目录路径（v1 的 path 必须是「目录」，文件名取自 filename） */
  path: string;
  /** 文件名 */
  filename: string;
  /** 文件内容 (base64) */
  content: string;
}

export interface DownloadRequest {
  /** 文件路径 */
  path: string;
}

export interface FileSearchRequest {
  /** 搜索路径 */
  path: string;
  /** 页码 */
  page?: number;
  /** 每页数量 */
  pageSize?: number;
  /** 搜索关键词 */
  search?: string;
  /** 排序方式（v2 字段名；v1 是 sortBy，内部会做映射） */
  sort?: string;
  /** v1 排序字段：name / size / modTime 等 */
  sortBy?: string;
  /** v1 排序方向：ascending / descending */
  sortOrder?: string;
  /** 是否显示隐藏文件 */
  showHidden?: boolean;
  /** 是否包含子目录 */
  containSub?: boolean;
}

/**
 * 1Panel v1.x 文件 API 适配层
 *
 * 与原 v2 实现的语义差异（不是改前缀就能解决的）：
 *  - 下载：v1 是 GET /files/download?path=（直接流式返回文件内容），v2 才是 POST + body。
 *  - 建目录：v1 没有 /files/dir，建目录/建文件统一走 POST /files，用 isDir 区分。
 *  - 保存内容：v1 是 POST /files/save（v2 复用了 POST /files）。
 *  - 压缩/解压：字段名一致（files/dst/name/type/replace/secret）。
 *  - 移动：v1 是 { type: "cut"|"copy", oldPaths: string[], newPath, cover }（v2 是 { from, to, overwrite }）。
 *  - 重命名：v1 是 { oldName, newName }，且两个字段都是**完整路径**（v2 是 { path, name }）。
 *  - 改权限：v1 mode 是 int64，且是八进制数值（"755" → 0o755 = 493），v2 传字符串。
 *  - wget：v1 必填 name（文件名），v2 没有该字段，这里从 URL 末段推导。
 *  - 上传：v1 是 multipart/form-data（字段 file + path(目录) + overwrite），v2 是 JSON+base64。
 */
export class FileAPI extends BaseAPI {
  /**
   * 列出目录内容
   */
  async list(path: string, page = 1, pageSize = 100): Promise<any> {
    return this.post("/api/v1/files/search", { path, page, pageSize });
  }

  /**
   * 搜索文件
   */
  async search(params: FileSearchRequest): Promise<any> {
    // v1 的 FileOption 没有 sort 字段，只有 sortBy / sortOrder：把 v2 的 sort 映射过去
    const { sort, ...rest } = params;
    const body: Record<string, any> = { page: 1, pageSize: 100, ...rest };
    if (sort && !body.sortBy) {
      body.sortBy = sort;
    }
    return this.post("/api/v1/files/search", body);
  }

  /**
   * 获取文件内容
   */
  async getContent(path: string): Promise<any> {
    return this.post("/api/v1/files/content", { path });
  }

  /**
   * 保存文件内容
   * v1 的更新内容端点是 /files/save（POST /files 在 v1 是"创建文件/文件夹"）
   */
  async save(path: string, content: string): Promise<any> {
    return this.post("/api/v1/files/save", { path, content });
  }

  /**
   * 删除文件或目录
   *
   * v1 的 dto.FileDelete 是 { path, isDir, forceDelete }：服务端在 forceDelete 分支按 isDir
   * 分别走 DeleteDir / DeleteFile —— 强删目录时不带 isDir 会走 DeleteFile 并报
   * "directory not empty"（实测），所以这里先用 /files/search 探测一次路径自身的 isDir。
   */
  async delete(path: string, forceDelete = false): Promise<any> {
    const body: Record<string, any> = { path, forceDelete };
    if (forceDelete) {
      body.isDir = await this.resolveIsDir(path);
    }
    return this.post("/api/v1/files/del", body);
  }

  /**
   * 创建目录
   * v1 没有 /files/dir：建目录用 POST /files + isDir=true（建文件则 isDir=false）
   */
  async createDir(path: string): Promise<any> {
    return this.post("/api/v1/files", { path, isDir: true });
  }

  /**
   * 创建文件
   */
  async createFile(path: string): Promise<any> {
    return this.post("/api/v1/files", { path, content: "" });
  }

  /**
   * 压缩文件/目录
   */
  async compress(params: CompressRequest): Promise<any> {
    return this.post("/api/v1/files/compress", params);
  }

  /**
   * 解压文件
   */
  async decompress(params: DecompressRequest): Promise<any> {
    return this.post("/api/v1/files/decompress", params);
  }

  /**
   * 移动/复制文件或目录
   * v1 的 DTO 是 FileMove { type, oldPaths[], newPath, cover }，type 只认 cut/copy
   */
  async move(params: MoveRequest): Promise<any> {
    return this.post("/api/v1/files/move", {
      type: params.type ?? "cut",
      oldPaths: [params.from],
      newPath: params.to,
      cover: params.overwrite ?? false,
    });
  }

  /**
   * 重命名文件/目录
   * v1 传的是完整路径：oldName=原路径，newName=父目录 + 新文件名
   */
  async rename(params: RenameRequest): Promise<any> {
    const idx = params.path.lastIndexOf("/");
    const dir = idx > 0 ? params.path.slice(0, idx) : "";
    return this.post("/api/v1/files/rename", {
      oldName: params.path,
      newName: dir ? `${dir}/${params.name}` : params.name,
    });
  }

  /**
   * 修改文件权限 (chmod)
   * v1 的 mode 是 int64 且按八进制解释（UI 传的是 JS 的 0o755=493），所以这里把 "755" 按 8 进制解析
   */
  async chmod(params: ChmodRequest): Promise<any> {
    const mode = parseInt(String(params.mode).replace(/^0o?/i, ""), 8);
    if (Number.isNaN(mode)) {
      throw new Error(`1Panel v1 chmod 需要八进制权限字符串（如 "755"），收到: ${params.mode}`);
    }
    return this.post("/api/v1/files/mode", { path: params.path, mode, sub: params.sub ?? false });
  }

  /**
   * 修改文件所有者 (chown)
   */
  async chown(params: ChownRequest): Promise<any> {
    return this.post("/api/v1/files/owner", {
      path: params.path,
      user: params.user,
      group: params.group,
      sub: params.sub ?? false,
    });
  }

  /**
   * 检查文件是否存在
   */
  async check(path: string): Promise<any> {
    return this.post("/api/v1/files/check", { path });
  }

  /**
   * 获取文件大小
   */
  async getSize(path: string): Promise<any> {
    return this.post("/api/v1/files/size", { path });
  }

  /**
   * 获取目录树
   */
  async getTree(path: string): Promise<any> {
    return this.post("/api/v1/files/tree", { path });
  }

  /**
   * 下载文件
   * v1 是 GET /files/download?path=（鉴权头在请求里，直接流式返回文件内容，
   * 不是 v2 那种"返回下载链接"的接口；二进制文件会以文本形式返回）。
   */
  async download(path: string): Promise<any> {
    // FileAPI 没有自定义 get(...) 方法，super.get 就是 BaseAPI 的 HTTP GET（移植规约规则 5 的冲突不适用）
    return super.get(`/api/v1/files/download?path=${encodeURIComponent(path)}`);
  }

  /**
   * 上传文件
   * v1 是 multipart/form-data：file（文件本体）+ path（目标**目录**，必须含 "/"）+ overwrite
   * 注意：BaseAPI.request 默认写死 Content-Type: application/json，
   * 所以这里手工拼 multipart body 并显式带上 boundary 覆盖该头部。
   */
  async upload(params: UploadRequest): Promise<any> {
    const boundary = `----1PanelMCP${Date.now().toString(16)}`;
    const fileBuf = Buffer.from(params.content ?? "", "base64");
    const head = Buffer.from(
      `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="${params.filename}"\r\n` +
        `Content-Type: application/octet-stream\r\n\r\n`,
    );
    const tail = Buffer.from(
      `\r\n--${boundary}\r\n` +
        `Content-Disposition: form-data; name="path"\r\n\r\n${params.path}\r\n` +
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="overwrite"\r\n\r\ntrue\r\n` +
        `--${boundary}--\r\n`,
    );
    return this.request("/api/v1/files/upload", {
      method: "POST",
      body: Buffer.concat([head, fileBuf, tail]),
      headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
    });
  }

  /**
   * 通过 URL 下载文件到服务器
   * v1 必填 name（保存的文件名），v2 没有该字段：按 v1 前端的做法从 URL 末段推导
   */
  async wget(url: string, path: string, ignoreCertificate = false): Promise<any> {
    const last = url.split("?")[0].split("/").pop()?.trim() ?? "";
    const name = last && !last.includes(":") ? decodeURIComponent(last) : "download";
    return this.post("/api/v1/files/wget", { url, path, name, ignoreCertificate });
  }

  /**
   * 探测路径自身是不是目录
   *
   * v1 的 POST /files/search 底层是 GetFileList：传入**文件**路径时服务端会先把路径改写成它的父目录
   * （`if !data.IsDir() { Path = filepath.Dir(Path) }`），所以
   *   data.path === 请求路径   → 目录
   *   data.path === 父目录     → 文件
   *   data.path === ""        → 路径不存在
   * 三种情况都已对着真实面板实测过；探测不出就按文件处理，让删除接口报真实错误。
   */
  private async resolveIsDir(path: string): Promise<boolean> {
    try {
      const res = await this.post("/api/v1/files/search", { path, page: 1, pageSize: 1 });
      const data = res?.data;
      if (!data?.path) {
        return false;
      }
      const norm = (p: string) => p.replace(/\/+$/, "") || "/";
      return norm(data.path) === norm(path) && data.isDir === true;
    } catch {
      return false;
    }
  }
}
