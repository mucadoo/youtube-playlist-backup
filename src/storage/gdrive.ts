import { drive, type drive_v3 } from "@googleapis/drive";
import type { OAuth2Client } from "google-auth-library";
import type { Storage } from "./types.js";

const FOLDER_MIME = "application/vnd.google-apps.folder";

const quote = (s: string) => `'${s.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;

export class GoogleDriveStorage implements Storage {
  private readonly drive: drive_v3.Drive;
  private readonly folderIds = new Map<string, Promise<string>>();

  constructor(
    auth: OAuth2Client,
    private readonly folderPath: string,
    private readonly parentFolderId: string,
  ) {
    this.drive = drive({ version: "v3", auth });
  }

  async read(fileName: string): Promise<string | null> {
    const id = await this.findFile(fileName);
    if (!id) return null;
    const res = await this.drive.files.get({ fileId: id, alt: "media", supportsAllDrives: true }, { responseType: "text" });
    return res.data as unknown as string;
  }

  async write(fileName: string, content: string): Promise<void> {
    const media = { mimeType: "application/json", body: content };
    const id = await this.findFile(fileName);
    if (id) {
      await this.drive.files.update({ fileId: id, media, supportsAllDrives: true });
    } else {
      const { dir, name } = splitPath(fileName);
      await this.drive.files.create({
        requestBody: { name, parents: [await this.folder(dir)], mimeType: "application/json" },
        media,
        fields: "id",
        supportsAllDrives: true,
      });
    }
  }

  async flush(): Promise<void> {}

  describe(): string {
    return `Google Drive: ${this.folderPath}`;
  }

  private async findFile(fileName: string): Promise<string | null> {
    const { dir, name } = splitPath(fileName);
    return this.findChild(await this.folder(dir), name, false);
  }

  private async findChild(parentId: string, name: string, isFolder: boolean): Promise<string | null> {
    const res = await this.drive.files.list({
      q: [
        `name = ${quote(name)}`,
        `${quote(parentId)} in parents`,
        "trashed = false",
        `mimeType ${isFolder ? "=" : "!="} '${FOLDER_MIME}'`,
      ].join(" and "),
      fields: "files(id)",
      orderBy: "modifiedTime desc",
      pageSize: 1,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    return res.data.files?.[0]?.id ?? null;
  }

  /** Id of BACKUP_FOLDER/subPath, creating folders as needed. */
  private folder(subPath = ""): Promise<string> {
    return this.resolveFolder([this.folderPath, subPath].join("/").split("/").filter(Boolean).join("/"));
  }

  /** path is relative to the parent folder id; each path is looked up at most once per run. */
  private resolveFolder(path: string): Promise<string> {
    if (!path) return Promise.resolve(this.parentFolderId);
    let id = this.folderIds.get(path);
    if (!id) {
      const slash = path.lastIndexOf("/");
      const name = path.slice(slash + 1);
      id = (async () => {
        const parent = await this.resolveFolder(slash === -1 ? "" : path.slice(0, slash));
        return (
          (await this.findChild(parent, name, true)) ??
          (
            await this.drive.files.create({
              requestBody: { name, mimeType: FOLDER_MIME, parents: [parent] },
              fields: "id",
              supportsAllDrives: true,
            })
          ).data.id!
        );
      })();
      this.folderIds.set(path, id);
    }
    return id;
  }
}

function splitPath(filePath: string): { dir: string; name: string } {
  const parts = filePath.split("/").filter(Boolean);
  return { name: parts.pop() ?? "", dir: parts.join("/") };
}
