# youtube-playlist-backup

Daily backup of YouTube playlists, uploads, liked videos and subscriptions to **Google Drive** (default),
a **GitHub repo**, or the **local disk**. Back up specific playlists, everything on your account, everything
public on any channel, or any mix of these.
Records are never dropped: when YouTube deletes or privates a video, the backup keeps its last known
title and channel so you can still tell what used to be in that slot.

## Getting started

The whole thing runs in GitHub Actions on your own copy of this repo. You don't need to install anything locally.

### 1. Get your own copy of the repo

Click **Fork** at the top of this page. Your fork runs the backup with your credentials.

> Forks of public repos are public. That's fine for Google Drive, because the backup files go to your Drive
> and your credentials stay in encrypted secrets. If you'll store the backups **in GitHub**, keep them private:
> either write them to a separate private repo (see step 4), or use *New repository → Import a repository*
> with this repo's URL to make a private copy instead of forking.

### 2. Enable Actions on your fork

Open the **Actions** tab of your fork and click **I understand my workflows, go ahead and enable them**.
GitHub turns off workflows on new forks until you do this.

### 3. Get Google credentials

- **Google Drive, private playlists, or anything under `mine`.** You need OAuth: a client id, a client secret and a
  refresh token. Follow [Google setup (OAuth)](#google-setup-oauth). It can all be done in the browser.
- **Only public or unlisted playlists, saved to GitHub.** An API key is enough. In
  [Google Cloud Console](https://console.cloud.google.com/), create a project, enable the
  **YouTube Data API v3**, then go to *APIs & Services → Credentials → Create credentials → API key*.

### 4. Add secrets and variables

In your fork, go to *Settings → Secrets and variables → Actions*.

**Secrets** tab. Add the ones for your setup:

| Secret                 | When |
| ---------------------- | ---- |
| `GOOGLE_CLIENT_ID`     | OAuth |
| `GOOGLE_CLIENT_SECRET` | OAuth |
| `GOOGLE_REFRESH_TOKEN` | OAuth |
| `YOUTUBE_API_KEY`      | API key setup only |
| `BACKUP_GITHUB_TOKEN`  | Only if the backups go to a *different* GitHub repo. Use a fine-grained PAT with *Contents: read and write* on that repo |

**Variables** tab:

| Variable            | Example                | Notes |
| ------------------- | ---------------------- | ----- |
| `BACKUP_SOURCES`    | `mine PL0123456789`    | Required. See [What gets backed up](#what-gets-backed-up) |
| `STORAGE_BACKEND`   | `gdrive`               | `gdrive` (default) or `github` |
| `BACKUP_FOLDER`     | `Backups/YouTube`      | Folder on Drive, or path in the repo |
| `BACKUP_FILE_NAME`  | `{kind}/{id}.json`     | Can use `{id}`, `{title}` and `{kind}`. A `/` makes subfolders |
| `BACKUP_GITHUB_REPOSITORY` | `you/my-backups` | `github` backend only. Defaults to the fork itself |
| `BACKUP_GITHUB_BRANCH`     | `backups`        | `github` backend only. Created if missing. Defaults to the repo's default branch |

The `github` backend has more options, such as its own folder and file name. See [GitHub backend](#github-backend).

### 5. Run it

In the **Actions** tab, open **Backup YouTube playlists** and click **Run workflow**. Check the log: it lists
each playlist and the file it wrote. After that it runs every day at midnight UTC. To change the time, edit the
`cron` line in `.github/workflows/backup.yml`.

> GitHub disables scheduled workflows in public repos after 60 days without any repo activity, and emails
> you when it does. With the Drive backend, nothing gets committed, so this can happen. If it does, click
> **Enable workflow** on the Actions tab.

### Running locally (optional)

Useful for trying things out or for getting the OAuth refresh token with `npm run auth`. Needs Node.js 22.9+.

```bash
git clone https://github.com/<your-user>/youtube-playlist-backup.git
cd youtube-playlist-backup
npm install
cp .env.example .env   # fill in the same values as the secrets/variables above
npm run backup         # STORAGE_BACKEND=local writes to ./data instead
npm test
```

## What gets backed up

`BACKUP_SOURCES` is a list of entries, separated by commas, spaces or new lines. Mix them however you like.

**Specific playlists**

| Entry        | Meaning           | Needs |
| ------------ | ----------------- | ----- |
| `PLxxxxxxxx` | A single playlist | API key for public/unlisted playlists, OAuth for private ones you own |

**Everything under a user**

| Entry            | Backs up                                                                      | Needs  |
| ---------------- | ----------------------------------------------------------------------------- | ------ |
| `mine`           | All of the signed-in account: playlists (private too), uploads, liked videos, subscriptions. **Not Watch Later**, see [below](#what-mine-includes-and-what-it-cant) | OAuth |
| `@handle`        | Everything public on that channel: playlists, uploads, subscriptions (skipped if private) | either |
| `channel:UCxxxx` | Same, by channel id                                                           | either |

**Just some kinds.** Add `:kind` to a user, and join several kinds with `+`. The kinds are `playlists`, `uploads`,
`liked` and `subscriptions`. `liked` only works with `mine`, because YouTube doesn't expose other people's likes.

**Exclusions.** Put `!` in front of any entry to leave it out.

Examples:

```bash
BACKUP_SOURCES=PL0123456789,PLabcdefghij          # just these two playlists
BACKUP_SOURCES=mine                                # everything on my account
BACKUP_SOURCES=mine !mine:subscriptions !PLjunk    # everything on my account except subscriptions and one playlist
BACKUP_SOURCES=mine:playlists+liked @someartist:uploads PL0123456789   # a mix
```

### What `mine` includes, and what it can't

| What | Backed up with `mine`? |
| ---- | ---------------------- |
| Your public, unlisted and private playlists | ✅ |
| Liked videos | ✅ saved as `liked` |
| Your uploads | ✅ (leave them out with `!mine:uploads`) |
| Your subscriptions | ✅ (leave them out with `!mine:subscriptions`) |
| **Watch Later** | ❌ not available, see below |
| Watch history | ❌ not available |
| Playlists you saved from other people | ❌ not listed by the API. Add each one's id as a specific playlist instead |

**Watch Later can't be backed up.** YouTube blocked API access to Watch Later in 2016; it now comes
back empty for every app, and nothing in this tool can get around that. Workarounds:

- **Keep it as a normal playlist (recommended).** On YouTube, open Watch Later, then ⋮ → *Add all to…* →
  a new private playlist. Save new videos there from now on. `mine` backs it up like any other playlist,
  and deleted videos are tracked too.
- **Google Takeout.** [Takeout](https://takeout.google.com/) (*YouTube and YouTube Music → playlists*)
  exports Watch Later as a CSV of video ids. It's a one-off manual export, not part of the daily backup.

`PLAYLIST_IDS` is the old name for `BACKUP_SOURCES` and still works.

## Output

Each playlist, uploads list, liked-videos list or subscriptions list becomes one file, at
`BACKUP_FOLDER/BACKUP_FILE_NAME`:

```json
{
  "id": "PL...",
  "kind": "playlist",
  "title": "Road trip",
  "owner": "me",
  "updatedAt": "2026-09-23T04:17:02.000Z",
  "items": [
    {
      "itemId": "UEw...",
      "videoId": "dQw4w9WgXcQ",
      "title": "Rick Astley - Never Gonna Give You Up",
      "channel": "Rick Astley",
      "channelId": "UCuAXFkgsw1L7xaCfnd5JJOw",
      "position": 0,
      "addedAt": "2024-01-15T12:00:00Z",
      "firstSeenAt": "2026-09-23T04:17:02.000Z",
      "status": "active",
      "statusChangedAt": "2026-09-23T04:17:02.000Z"
    }
  ]
}
```

| `kind`          | `id`                                       | Items |
| --------------- | ------------------------------------------ | ----- |
| `playlist`      | the playlist id                            | videos |
| `uploads`       | the channel's uploads playlist id (`UU…`)  | videos |
| `liked`         | `liked`                                    | videos, newest like first. `addedAt` is empty because the API doesn't say when a video was liked |
| `subscriptions` | `subscriptions` for yours, `subscriptions-UC…` for another channel | channels. `videoId` is empty, `title` is the channel name |

`status` is one of:
- `active`: the video is playable.
- `unavailable`: still in the playlist, but YouTube shows it as "Deleted video" or "Private video". The old title and channel are kept.
- `removed`: no longer in the list. A deleted video disappears from liked videos entirely, so there it shows up as `removed`, still with its title.

Gone items stay in the file, with `statusChangedAt` recording when the change was detected. There's no
separate log of deleted items: to find everything that's gone, look for items whose `status` isn't `active`.
The run log also lists anything that went away during that run. A file is written only when its content changed.

## Configuration

Copy `.env.example` to `.env`. The main variables:

| Variable                | Default                                               | Notes |
| ----------------------- | ----------------------------------------------------- | ----- |
| `STORAGE_BACKEND`       | `gdrive`                                              | `gdrive`, `github` or `local` |
| `BACKUP_FOLDER`         | `YouTube Playlist Backup` (gdrive), `data` (others)   | A `/`-separated path, created if missing. `/` means the top level |
| `BACKUP_SOURCES`        |                                                       | Required. See [What gets backed up](#what-gets-backed-up) |
| `BACKUP_FILE_NAME`      | `{id}.json`                                           | Placeholders: `{id}`, `{title}`, `{kind}`. A `/` makes subfolders, e.g. `{kind}/{id}.json` |
| `GDRIVE_PARENT_FOLDER_ID` | `root`                                              | Where `BACKUP_FOLDER` is created |
| `BACKUP_GDRIVE_FOLDER`, `BACKUP_GDRIVE_FILE_NAME` | | Override `BACKUP_FOLDER` / `BACKUP_FILE_NAME` for Drive only |
| `BACKUP_GITHUB_*`       |                                                       | GitHub backend settings. See [GitHub backend](#github-backend) |

> Prefer `{id}` in the file name. If you use `{title}` and then rename the playlist,
> the next run starts a new file and its history is not carried over.

### GitHub backend

Every setting can be given as `BACKUP_GITHUB_*`, which takes priority over the shared ones.

| Variable                              | Default                        | Notes |
| ------------------------------------- | ------------------------------ | ----- |
| `BACKUP_GITHUB_REPOSITORY`            | the repo running the workflow  | `owner/repo`. Required when running locally |
| `BACKUP_GITHUB_TOKEN`                 | the workflow's token           | Needs *Contents: read and write* on that repo. Required when running locally |
| `BACKUP_GITHUB_BRANCH`                | the repo's default branch      | If the branch doesn't exist, it's created with no history, holding only the backups |
| `BACKUP_GITHUB_FOLDER`                | `BACKUP_FOLDER`, else `data`   | Path inside the repo. `/` means the repo root |
| `BACKUP_GITHUB_FILE_NAME`             | `BACKUP_FILE_NAME`, else `{id}.json` | Same placeholders; `/` makes subfolders |
| `BACKUP_GITHUB_COMMIT_MESSAGE`        | `chore: update playlist backup` | |

When running locally, the plain `GITHUB_TOKEN`, `GITHUB_REPOSITORY`, `GITHUB_BRANCH` and `GITHUB_COMMIT_MESSAGE`
also work. In Actions, use the `BACKUP_GITHUB_*` names, because GitHub reserves `GITHUB_*`.

Example: to keep the backups on a separate `backups` branch of your fork, with one folder per kind at the top level:

```bash
STORAGE_BACKEND=github
BACKUP_GITHUB_BRANCH=backups
BACKUP_GITHUB_FOLDER=/
BACKUP_GITHUB_FILE_NAME={kind}/{id}.json
```

Each run makes at most one commit, and only when something changed. A brand-new repo with no commits
can't be written to through GitHub's API, so if you use a separate data repo, tick **Add a README** when
you create it.

## Google setup (OAuth)

You need OAuth for Drive, for `mine`, and for private playlists.

1. In [Google Cloud Console](https://console.cloud.google.com/), create a project. Under *APIs & Services → Library*,
   enable the **YouTube Data API v3** and the **Google Drive API**.
2. Set up the OAuth consent screen (*Google Auth Platform*). Choose *External* and add your own Google account
   as a test user. Then go to *Audience* and click **Publish app** (to "In production").
   Refresh tokens for apps left in "Testing" expire after 7 days. An unverified app is fine for personal use;
   you'll just click through a "Google hasn't verified this app" warning when you sign in.
3. Get a refresh token. Pick one:

   **In the browser (no install).**
   1. Create an OAuth client (*Clients → Create client*) of type **Web application**. Add
      `https://developers.google.com/oauthplayground` as an authorized redirect URI.
   2. Open the [OAuth 2.0 Playground](https://developers.google.com/oauthplayground). Click the gear icon, tick
      **Use your own OAuth credentials**, and paste in the client id and secret.
   3. In the *Input your own scopes* box, enter
      `https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/drive.file`.
      Then click **Authorize APIs**, sign in, and approve.
   4. Click **Exchange authorization code for tokens** and copy the **Refresh token**.

   **Locally.**
   1. Create an OAuth client of type **Desktop app**.
   2. Put its id and secret in `.env`, run `npm run auth`, open the URL it prints, and approve.
      It prints `GOOGLE_REFRESH_TOKEN=...`.
4. Save the client id, client secret and refresh token as the `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and
   `GOOGLE_REFRESH_TOKEN` secrets. Put them in `.env` too if you also run it locally.

Scopes: `youtube.readonly` and `drive.file`. With `drive.file` the app can only see files and folders it
created itself. So let it create `BACKUP_FOLDER`; don't point `GDRIVE_PARENT_FOLDER_ID` at a folder
you created by hand, because the app won't be able to see it.

If you only back up public or unlisted playlists to GitHub or the local disk, a `YOUTUBE_API_KEY` is enough.

## GitHub Actions

`.github/workflows/backup.yml` runs every day and can also be started by hand. Set these in the repo settings:

- **Secrets:** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` (or `YOUTUBE_API_KEY`)
- **Variables:** `BACKUP_SOURCES`, plus any of the settings in [Configuration](#configuration), such as
  `STORAGE_BACKEND`, `BACKUP_FOLDER`, `BACKUP_FILE_NAME`, `BACKUP_GDRIVE_*` or `BACKUP_GITHUB_*`

For `STORAGE_BACKEND=github`, the job commits into this same repo by default, using the built-in token.
To write to a separate private data repo, set the variable `BACKUP_GITHUB_REPOSITORY=owner/repo` and the secret
`BACKUP_GITHUB_TOKEN`, a fine-grained PAT with *Contents: read and write* on that repo.

## Quota

Reading a playlist or uploads list costs 1 unit per 50 videos, plus 1 unit for its metadata. Liked videos and
subscriptions cost 1 unit per 50 items. Expanding a user costs 1 unit, plus 1 per 50 playlists. The free daily quota is 10,000 units, far more than
this needs.
