# Manga Reader Selfhosted

Private self-hosted manga/manhwa reader for personal archives.

Manga Reader Selfhosted is a local-first web app for organizing and reading your own manga/manhwa files from a private server. It supports archive uploads, folder uploads, automatic thumbnails, reading progress, page/webtoon reading modes, configurable storage quotas, and private access from devices such as a Mac or iPhone.

This project is designed for personal archives. It does not include scraping, external downloads, public catalogs, discovery features, or protected content.

## Features

- Upload `.zip`, `.cbz`, `.rar`, and `.cbr` archives.
- Upload folders with loose image files.
- Upload folders with subfolders and import them as separate chapters.
- Local library with automatic thumbnails.
- Manga detail pages with chapter management.
- Bulk chapter renaming and chapter reordering.
- Duplicate upload detection with clear warnings.
- Page reader and webtoon reader modes.
- Single-page and double-page reading on desktop.
- Reading direction controls.
- Zoom and fit modes for page reading.
- Immersive reader mode.
- Reading progress stored locally in SQLite.
- Configurable storage quota with usage indicator.
- Upload preflight that estimates storage impact before importing.
- Backend quota enforcement with cleanup on failed imports.
- Optional password gate through `APP_PASSWORD`.
- Private deployment on a VM, with remote access through Tailscale.

## Tech Stack

| Area | Stack |
|---|---|
| Frontend | React, Vite, CSS |
| Backend | Node.js, Express |
| Database | SQLite |
| File processing | Sharp, yauzl, node-unrar-js |
| Private access | Tailscale |
| Deployment target | Google Cloud VM or any private Node.js host |

## Requirements

- Node.js 24 or newer.
- npm.
- macOS, Linux, or another environment that can run Node.js.
- Disk space for extracted pages, thumbnails, temporary uploads, and the SQLite database.

For private remote access, use a private network layer such as Tailscale. Do not expose the app directly to the public internet unless you understand and accept the risk.

## Quick Start

```bash
git clone https://github.com/Teyocesu/Manga-Reader-Selfhosted.git
cd Manga-Reader-Selfhosted
npm install
cp .env.example .env
```

Edit `.env` and set at least:

```text
APP_PASSWORD=your_private_password
STORAGE_QUOTA_GB=25
```

Start the development servers:

```bash
npm run dev
```

Open:

```text
http://localhost:5173
```

Default local services:

| Service | URL |
|---|---|
| Frontend | `http://localhost:5173` |
| Backend API | `http://localhost:3001` |
| Health check | `http://localhost:3001/api/health` |

The backend and Vite dev server listen on `0.0.0.0`, so another device on the same private network can open the app using the host machine address.

## Configuration

Configuration is loaded from `.env` at the project root.

Create it from the example file:

```bash
cp .env.example .env
```

Available variables:

| Variable | Default | Description |
|---|---:|---|
| `PORT` | `3001` | Backend port. |
| `DATA_DIR` | `./data` | Directory for SQLite data. |
| `STORAGE_DIR` | `./storage` | Directory for extracted pages, thumbnails, and upload temp files. |
| `STORAGE_QUOTA_GB` | `25` | App-level storage quota in GB. |
| `STORAGE_QUOTA_BYTES` | empty | Exact quota in bytes. If set, it takes priority over `STORAGE_QUOTA_GB`. |
| `MAX_UPLOAD_MB` | `1024` | Maximum accepted upload size. |
| `MAX_IMAGES_PER_CHAPTER` | `1000` | Maximum number of images per imported chapter. |
| `APP_PASSWORD` | empty | Password required to access the app. Use a private value. |
| `NODE_ENV` | `production` in `.env.example` | Runtime mode used by production start. |

Important:

- Do not commit `.env`.
- Do not share `APP_PASSWORD` in screenshots, logs, issues, or commits.
- If `APP_PASSWORD` is empty, the app can run without a password gate.
- `STORAGE_QUOTA_BYTES` is useful for precise QA and small test environments.

## Storage Layout

By default, local app data is stored in:

```text
data/
  manga-reader.sqlite
  manga-reader.sqlite-shm
  manga-reader.sqlite-wal

storage/
  library/
  thumbnails/
  .tmp/
```

What each path contains:

| Path | Purpose |
|---|---|
| `data/manga-reader.sqlite` | Manga metadata, chapters, pages, and reading progress. |
| `storage/library/` | Extracted image pages organized by manga and chapter. |
| `storage/thumbnails/` | Generated manga thumbnails. |
| `storage/.tmp/` | Temporary uploads and archive extraction files. |

`data/` and `storage/` are ignored by Git except for `.gitkeep` placeholders.

## Storage Quota

The app exposes storage status through `GET /api/storage` and shows a storage bar in the UI.

The quota calculation includes:

- Extracted pages in `storage/library/`.
- Thumbnails in `storage/thumbnails/`.
- Temporary upload/extraction files in `storage/.tmp/`.
- SQLite database files in `DATA_DIR`.

The API returns:

- `quotaBytes`
- `usedBytes`
- `freeQuotaBytes`
- `diskFreeBytes` when the OS provides it
- `percentUsed`
- `breakdown`
- `heavyMangas`
- warning state: `ok`, `near`, or `critical`

Uploads are checked twice:

1. Frontend preflight estimates the queued upload size using `File.size`.
2. Backend validates the extracted/imported size and rejects imports that would exceed quota.

If an import fails because of quota, partial files and temporary files are cleaned up.

## Development

Run backend and frontend together:

```bash
npm run dev
```

Run only the backend:

```bash
npm run dev:server
```

Run only the frontend:

```bash
npm run dev:client
```

Build the frontend:

```bash
npm run build
```

Audit dependencies:

```bash
npm audit --audit-level=moderate
```

## Production Run

Build the client first:

```bash
npm install
npm run build
```

Then start the production server:

```bash
npm run start
```

In production mode, the Express server serves the built client from `client/dist` and the API from the same backend process.

Open:

```text
http://<server-host>:3001
```

Use a process manager such as `systemd`, `pm2`, or your VM provider's startup mechanism if you want the app to survive reboots.

## Private Deployment Notes

This app is intended for private deployment.

A common setup is:

1. Create a private VM, for example on Google Cloud.
2. Install Node.js 24+ and npm.
3. Clone the repository on the VM.
4. Configure `.env` with private paths, quota, and `APP_PASSWORD`.
5. Run `npm install`.
6. Run `npm run build`.
7. Start the server with `npm run start` under a process manager.
8. Install and authenticate Tailscale on the VM.
9. Access the app from your own Mac/iPhone through the Tailscale private network.

Do not place private Tailscale IPs, auth keys, passwords, VM credentials, or local filesystem paths in this README, commits, screenshots, or public issues.

## Usage

1. Open the app in your browser.
2. Enter the app password if configured.
3. Go to `Subir`.
4. Choose whether to create a new manga or add to an existing one.
5. Upload an archive or a folder:
   - `.zip`
   - `.cbz`
   - `.rar`
   - `.cbr`
   - folder with image files
   - folder with chapter subfolders
6. Review storage preflight warnings.
7. Start the upload queue.
8. Open the manga from the library.
9. Read in page mode or webtoon mode.

The app stores reading progress automatically.

## Reader Controls

The reader includes:

- Page mode.
- Webtoon mode.
- Single-page mode.
- Double-page desktop mode.
- Left-to-right and right-to-left direction.
- Zoom percentages.
- Fit page, fit width, and fit height.
- Immersive mode.
- Fullscreen when supported by the browser.
- Direct page jump.
- End-of-chapter actions.

Keyboard shortcuts:

| Shortcut | Action |
|---|---|
| Left/right arrows | Navigate pages in page mode. |
| `H` | Hide/show reader UI. |
| `F` | Toggle fullscreen when supported. |

## Supported Upload Formats

| Format | Support |
|---|---|
| `.zip` | Supported through `yauzl`. |
| `.cbz` | Supported through `yauzl`. |
| `.rar` | Supported through `node-unrar-js`. |
| `.cbr` | Supported through `node-unrar-js`. |
| Folders | Supported through browser folder upload. |

Archive behavior:

- Direct images inside archives are supported.
- One level of nested archive is supported.
- Packs with multiple inner archives are imported as separate chapters.
- Archives that mix direct images and inner archives are rejected to avoid ambiguous imports.
- Archives nested deeper than one level are rejected.

Use only files you own or are legally allowed to store and read.

## Managing the Library

From the library and manga detail pages, you can:

- Search and sort manga.
- Switch between cover and compact views.
- Continue reading from saved progress.
- Edit manga titles.
- Edit chapter titles.
- Rename multiple chapters.
- Reorder chapters.
- Delete chapters.
- Delete a manga and its local files.

Deleting a manga or chapter removes its stored pages. Deleting a manga also removes its thumbnail.

## Backup and Migration

To back up the app, stop the server and copy:

```text
data/
storage/
.env
```

Recommended backup contents:

| Path | Why |
|---|---|
| `data/` | Metadata, chapters, pages, and progress. |
| `storage/` | Extracted pages and thumbnails. |
| `.env` | Local configuration. Keep it private. |

Do not commit backups to Git.

To move to another machine:

1. Install Node.js 24+.
2. Clone the repository.
3. Run `npm install`.
4. Restore `data/`, `storage/`, and `.env`.
5. Run `npm run build`.
6. Start with `npm run start`.

## API Overview

Health and auth:

- `GET /api/health`
- `GET /api/auth/status`
- `POST /api/auth/login`

Config and storage:

- `GET /api/config`
- `GET /api/storage`

Library:

- `GET /api/library`
- `GET /api/mangas/:mangaId`
- `PUT /api/mangas/:mangaId`
- `DELETE /api/mangas/:mangaId`
- `GET /api/mangas/:mangaId/thumbnail`

Chapters:

- `GET /api/chapters/:chapterId`
- `PUT /api/chapters/:chapterId`
- `DELETE /api/chapters/:chapterId`
- `POST /api/mangas/:mangaId/chapters/reorder`
- `POST /api/mangas/:mangaId/chapters/rename`

Pages and progress:

- `GET /api/pages/:pageId/image`
- `GET /api/progress/:chapterId`
- `PUT /api/progress/:chapterId`

Uploads:

- `POST /api/upload`

Most API routes require authentication when `APP_PASSWORD` is configured.

## Troubleshooting

### The frontend opens but cannot connect to the backend

Check that the backend is running:

```bash
curl http://localhost:3001/api/health
```

If you changed `PORT`, update your frontend API base URL or use the production server.

### Login does not work after changing the password

Restart the server after editing `.env`.

### Upload is rejected as too large

Increase `MAX_UPLOAD_MB` in `.env` and restart the server. Keep the value realistic for your VM memory and disk.

### Upload is rejected by storage quota

Check the storage bar or:

```bash
curl http://localhost:3001/api/storage
```

Increase `STORAGE_QUOTA_GB`, set `STORAGE_QUOTA_BYTES`, delete old manga, or add disk space.

### Thumbnails do not appear

Confirm that `storage/thumbnails/` is writable by the Node.js process. Re-uploading or uploading a new manga can generate new thumbnails.

### iPhone cannot open the app

Check:

- The server is running.
- The device can reach the host through the private network.
- Tailscale is connected on both devices if using Tailscale.
- You are using the correct host and port.

### RAR/CBR files fail

Make sure the file is a valid RAR archive. This project uses `node-unrar-js` to avoid system-level unrar dependencies.

## Security Notes

- Keep the app private.
- Use `APP_PASSWORD`.
- Prefer Tailscale or another private network instead of public exposure.
- Do not commit `.env`, database files, storage files, thumbnails, uploads, backups, or logs.
- Do not store secrets in README files, issues, screenshots, or commit messages.

## What This Project Does Not Do

- No scraping.
- No external manga downloads.
- No public catalog.
- No content discovery.
- No user marketplace.
- No DRM bypassing.
- No hosting or distribution of manga content.

It is a reader and organizer for personal archives.

## GitHub Remote

Expected remote:

```text
https://github.com/Teyocesu/Manga-Reader-Selfhosted.git
```

Check it with:

```bash
git remote -v
```

Do not push to a remote you do not recognize.
