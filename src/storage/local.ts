import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Storage } from "./types.js";

export class LocalStorage implements Storage {
  constructor(private readonly folder: string) {}

  async read(fileName: string): Promise<string | null> {
    try {
      return await readFile(path.join(this.folder, fileName), "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }

  async write(fileName: string, content: string): Promise<void> {
    const file = path.join(this.folder, fileName);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, content);
  }

  async flush(): Promise<void> {}

  describe(): string {
    return path.resolve(this.folder);
  }
}
