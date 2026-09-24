/** File paths are relative to the backup folder and may contain "/" for subfolders. */
export interface Storage {
  /** Returns the file contents, or null if it does not exist yet. */
  read(fileName: string): Promise<string | null>;
  /** Stages a write. Backends may apply it immediately or on flush(). */
  write(fileName: string, content: string): Promise<void>;
  /** Persists any staged writes. */
  flush(): Promise<void>;
  /** Human-readable location, for logs. */
  describe(): string;
}
