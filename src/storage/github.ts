import { Octokit } from "@octokit/rest";
import type { Storage } from "./types.js";

/**
 * Commits files to a GitHub repo via the Git Data API. All writes from one run land in a
 * single commit on flush(), so history shows one commit per day with actual changes.
 */
export class GitHubStorage implements Storage {
  private readonly octokit: Octokit;
  private readonly owner: string;
  private readonly repo: string;
  private branch: string | undefined;
  private readonly pending = new Map<string, string>();

  constructor(
    token: string,
    repository: string,
    branch: string | undefined,
    private readonly folder: string,
    private readonly commitMessage: string,
  ) {
    const [owner, repo] = repository.split("/");
    if (!owner || !repo) throw new Error(`GITHUB_REPOSITORY must be "owner/repo" (got "${repository}")`);
    this.owner = owner;
    this.repo = repo;
    this.branch = branch;
    this.octokit = new Octokit({ auth: token });
  }

  async read(fileName: string): Promise<string | null> {
    try {
      const res = await this.octokit.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path: this.path(fileName),
        ref: await this.getBranch(),
        mediaType: { format: "raw" },
      });
      return res.data as unknown as string;
    } catch (err) {
      if ((err as { status?: number }).status === 404) return null;
      throw err;
    }
  }

  async write(fileName: string, content: string): Promise<void> {
    this.pending.set(this.path(fileName), content);
  }

  async flush(): Promise<void> {
    if (this.pending.size === 0) return;
    const { owner, repo } = this;
    const branch = await this.getBranch();

    const ref = await this.octokit.git.getRef({ owner, repo, ref: `heads/${branch}` });
    const parentSha = ref.data.object.sha;
    const parent = await this.octokit.git.getCommit({ owner, repo, commit_sha: parentSha });

    const tree = await this.octokit.git.createTree({
      owner,
      repo,
      base_tree: parent.data.tree.sha,
      tree: [...this.pending].map(([path, content]) => ({ path, mode: "100644", type: "blob", content })),
    });
    const commit = await this.octokit.git.createCommit({
      owner,
      repo,
      message: this.commitMessage,
      tree: tree.data.sha,
      parents: [parentSha],
    });
    await this.octokit.git.updateRef({ owner, repo, ref: `heads/${branch}`, sha: commit.data.sha });
    this.pending.clear();
  }

  describe(): string {
    return `GitHub: ${this.owner}/${this.repo}/${this.folder}`;
  }

  private path(fileName: string): string {
    return [...this.folder.split("/"), fileName].filter(Boolean).join("/");
  }

  private async getBranch(): Promise<string> {
    this.branch ??= (await this.octokit.repos.get({ owner: this.owner, repo: this.repo })).data.default_branch;
    return this.branch;
  }
}
