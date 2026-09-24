import { drive, type drive_v3 } from "@googleapis/drive";
import type { OAuth2Client } from "google-auth-library";
import type { Storage } from "./types.js";

const FOLDER_MIME = "application/vnd.google-apps.folder";

const quote = (s: string) => `'${s.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;

export class GoogleDriveStorage implements Storage {
  private readonly drive: drive_v3.Drive;
  private folderId: Promise<string> | undefined;

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
      await this.drive.files.create({
        requestBody: { name: fileName, parents: [await this.folder()], mimeType: "application/json" },
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
    return this.findChild(await this.folder(), fileName, false);
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

  /** Resolves (creating as needed) the folder path once per run. */
  private folder(): Promise<string> {
    this.folderId ??= (async () => {
      let parent = this.parentFolderId;
      for (const name of this.folderPath.split("/").filter(Boolean)) {
        parent =
          (await this.findChild(parent, name, true)) ??
          (
            await this.drive.files.create({
              requestBody: { name, mimeType: FOLDER_MIME, parents: [parent] },
              fields: "id",
              supportsAllDrives: true,
            })
          ).data.id!;
      }
      return parent;
    })();
    return this.folderId;
  }
}
