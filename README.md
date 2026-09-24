# youtube-playlist-backup

Daily backup of YouTube playlists to **Google Drive** (default), a **GitHub repo**, or the **local disk**.
Records are never dropped: when YouTube deletes or privates a video, the backup keeps its last known
title and channel so you can still tell what used to be in that slot.

## What gets backed up

`PLAYLIST_IDS` is a comma-separated list; you can mix these forms:

| Entry            | Meaning                                                    | Needs  |
| ---------------- | ---------------------------------------------------------- | ------ |
| `PLxxxxxxxx`     | A single playlist                                          | API key for public/unlisted playlists, OAuth for private ones |
| `mine`           | Every playlist on the signed-in account, private included | OAuth  |
| `@handle`        | Every public playlist of a channel                         | either |
| `channel:UCxxxx` | Every public playlist of a channel id                      | either |

Example: `PLAYLIST_IDS=mine,@someartist,PL0123456789`

## Output

For each playlist, `BACKUP_FOLDER/BACKUP_FILE_NAME` holds:

```json
{
  "playlistId": "PL...",
  "title": "Road trip",
  "channel": "me",
  "updatedAt": "2026-09-23T04:17:02.000Z",
  "items": [
    {
      "playlistItemId": "UEw...",
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

`status` is one of:
- `active`: the video is playable.
- `unavailable`: still in the playlist, but YouTube shows it as "Deleted video" or "Private video". The old title and channel are kept.
- `removed`: no longer in the playlist.

Whenever a track moves from `active` to one of the others, an entry is added to `DELETED_LOG_FILE_NAME`
in the same folder. A file is written only when its content changed.

## Configuration

Copy `.env.example` to `.env`. The main variables:

| Variable                | Default                                               | Notes |
| ----------------------- | ----------------------------------------------------- | ----- |
| `STORAGE_BACKEND`       | `gdrive`                                              | `gdrive`, `github` or `local` |
| `BACKUP_FOLDER`         | `YouTube Playlist Backup` (gdrive), `data` (others)   | A `/`-separated path, created if missing |
| `BACKUP_FILE_NAME`      | `{playlistId}.json`                                   | Placeholders: `{playlistId}`, `{playlistTitle}` |
| `DELETED_LOG_FILE_NAME` | `deleted_tracks.json`                                 | |
| `GDRIVE_PARENT_FOLDER_ID` | `root`                                              | Where `BACKUP_FOLDER` is created |
| `GITHUB_REPOSITORY`, `GITHUB_TOKEN`, `GITHUB_BRANCH` | | For the `github` backend. `GITHUB_BRANCH` defaults to the repo's default branch |

> Prefer `{playlistId}` in the file name. If you use `{playlistTitle}` and then rename the playlist,
> the next run starts a new file and its history is not carried over.

## Google setup (OAuth)

You need OAuth for Drive, for `mine`, and for private playlists.

1. In Google Cloud Console, create a project and enable the **YouTube Data API v3** and the **Google Drive API**.
2. Set up the OAuth consent screen and add yourself as a test user. Then **publish the app** (to "In production").
   Refresh tokens for apps left in "Testing" expire after 7 days. An unverified app is fine for personal use;
   you'll just click through a warning when you sign in.
3. Create an OAuth client of type **Desktop app**. Put its id and secret in `.env`.
4. Run `npm run auth`, open the URL it prints, and approve. Copy the printed `GOOGLE_REFRESH_TOKEN` into `.env`.

Scopes: `youtube.readonly` and `drive.file`. With `drive.file` the app can only see files and folders it
created itself. So let it create `BACKUP_FOLDER`; don't point `GDRIVE_PARENT_FOLDER_ID` at a folder
you created by hand, because the app won't be able to see it.

If you only back up public or unlisted playlists to GitHub or the local disk, a `YOUTUBE_API_KEY` is enough.

## Running

```bash
npm install
npm run backup   # runs from source, reads .env
npm test
```

## GitHub Actions

`.github/workflows/backup.yml` runs every day and can also be started by hand. Set these in the repo settings:

- **Secrets:** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` (or `YOUTUBE_API_KEY`)
- **Variables:** `PLAYLIST_IDS`, plus any of `STORAGE_BACKEND`, `BACKUP_FOLDER`, `BACKUP_FILE_NAME`,
  `DELETED_LOG_FILE_NAME` and `GDRIVE_PARENT_FOLDER_ID`

For `STORAGE_BACKEND=github`, the job commits into this same repo by default, using the built-in token.
To write to a separate private data repo, set the variable `BACKUP_REPOSITORY=owner/repo` and the secret
`BACKUP_GITHUB_TOKEN`, a fine-grained PAT with *Contents: read and write* on that repo.
Each run makes at most one commit, and only when something changed.

## Quota

Reading a playlist costs 1 unit per 50 videos, plus 1 unit for the playlist's metadata. Expanding
`mine` or a channel costs 1 unit per 50 playlists. The free daily quota is 10,000 units, far more than
this needs.
