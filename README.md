# Manga Reader Selfhosted

A private, self-hosted manga/manhwa reader for your own legally obtained archives.

It runs as a small Node.js + React web app, stores metadata in SQLite, extracts uploaded pages to local storage, and keeps reading progress per chapter. It is designed for personal libraries, homelabs, old laptops, small cloud VMs, and private access through tools like Tailscale.

> This project does **not** scrape, download, index, or provide manga. You bring your own files.

## Features

- Upload `.zip`, `.cbz`, `.rar`, and `.cbr` files.
- Upload folders of images from the browser.
- Import packs with multiple internal archives as separate chapters.
- Support one level of nested archives.
- Automatic cover thumbnails from uploaded pages.
- Library view, manga detail pages, chapter management, and title editing.
- Bulk chapter rename and manual chapter ordering.
- Page and webtoon reading modes.
- Immersive reader UI, keyboard shortcuts, fullscreen when supported, zoom, and desktop double-page mode.
- Reading progress saved in SQLite.
- Simple password gate with `APP_PASSWORD`.
- Storage quota controls with disk-space checks.
- Production build served by Express.

## Tech stack

- React + Vite client
- Node.js 24+
- Express server
- SQLite via Node's built-in `node:sqlite`
- Local filesystem storage
- `sharp` for thumbnails
- `yauzl` for ZIP/CBZ
- `node-unrar-js` for RAR/CBR

## Requirements

- Node.js `24` or newer
- npm
- A machine with enough local disk for your library

For a small private instance, 1 GB RAM can work, but using swap is recommended when installing dependencies or building the frontend on very small VMs.

## Quick start

```bash
git clone https://github.com/Teyocesu/Manga-Reader-Selfhosted.git
cd Manga-Reader-Selfhosted
npm ci
cp .env.example .env
npm run build
npm run start
```

Open:

```text
http://localhost:3001
```

During development, run both client and server:

```bash
npm run dev
```

Development URLs:

```text
Client: http://localhost:5173
Server: http://localhost:3001
Health: http://localhost:3001/api/health
```

## Configuration

Create `.env` from `.env.example`:

```bash
cp .env.example .env
```

Common values:

```env
PORT=3001
HOST=0.0.0.0
DATA_DIR=./data
STORAGE_DIR=./storage
STORAGE_QUOTA_GB=25
STORAGE_QUOTA_BYTES=
MAX_UPLOAD_MB=1024
MAX_IMAGES_PER_CHAPTER=1000
APP_PASSWORD=change-me
NODE_ENV=production
```

| Variable | Purpose |
|---|---|
| `PORT` | Server port. Defaults to `3001`. |
| `HOST` | Bind address. Use `0.0.0.0` for LAN/Tailscale access. |
| `DATA_DIR` | SQLite database location. |
| `STORAGE_DIR` | Extracted pages, thumbnails, and temporary upload files. |
| `STORAGE_QUOTA_GB` | Soft storage quota shown/enforced by the app. |
| `STORAGE_QUOTA_BYTES` | Exact quota override. Takes priority over `STORAGE_QUOTA_GB` when set. |
| `MAX_UPLOAD_MB` | Max upload size per request. |
| `MAX_IMAGES_PER_CHAPTER` | Safety limit for pages per chapter. |
| `APP_PASSWORD` | Optional password gate. Strongly recommended for any non-local access. |
| `NODE_ENV` | Use `production` to serve the built client from Express. |

### Password note

Do not commit your real `.env`. The repository ignores `.env` files by default. If `APP_PASSWORD` is empty, the app may be accessible without a login screen, so set a private password before exposing it to any network.

## Production deployment

A simple production deployment looks like this:

```bash
npm ci
cp .env.example .env
npm run build
npm run start
```

For a persistent Linux server, use a process manager such as PM2:

```bash
sudo npm install -g pm2
pm2 start "npm run start" --name manga-reader
pm2 save
pm2 startup
```

For private remote access, the recommended approach is a private mesh/VPN such as Tailscale instead of opening the app to the public internet.

Example private URL:

```text
http://100.x.y.z:3001
```

See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for a fuller server setup example.

## Local files and data

By default:

```text
data/manga-reader.sqlite
storage/library/
storage/thumbnails/
storage/.tmp/
```

`data/` and `storage/` are intentionally ignored by Git, except for placeholder `.gitkeep` files. Do not commit your manga files, database, thumbnails, `.env`, backups, or tokens.

## Supported formats

- `.zip` and `.cbz` via `yauzl`.
- `.rar` and `.cbr` via `node-unrar-js`.
- Direct image files inside archives.
- One level of nested archive.
- Multi-archive packs where each internal archive becomes a chapter.

If an upload mixes direct images and internal archives, the app rejects it to avoid ambiguous imports. If an internal archive contains another archive inside it, the app rejects it to keep the maximum nesting depth at one.

## API overview

Health and auth/config:

```text
GET /api/health
POST /api/login
POST /api/logout
GET /api/auth/status
GET /api/config
GET /api/storage
```

Library and reading:

```text
GET /api/library
GET /api/mangas/:mangaId
GET /api/mangas/:mangaId/thumbnail
PUT /api/mangas/:mangaId
DELETE /api/mangas/:mangaId
GET /api/chapters/:chapterId
PUT /api/chapters/:chapterId
DELETE /api/chapters/:chapterId
GET /api/pages/:pageId/image
GET /api/progress/:chapterId
PUT /api/progress/:chapterId
POST /api/upload
```

## Security and privacy

- This app is intended for personal/private use.
- Do not run it without `APP_PASSWORD` if other people or devices can reach the URL.
- Prefer private networking such as Tailscale for remote access.
- Avoid exposing port `3001` directly to the public internet unless you understand the risks and add proper TLS, reverse proxying, rate limits, and monitoring.
- Do not commit `.env`, the SQLite database, uploaded files, extracted pages, thumbnails, backups, API keys, or tokens.

## Legal note

This project is only a reader and library manager for files you provide. It does not include copyrighted content, scraping logic, downloader logic, external catalog integration, or piracy tooling. Use it only with content you own or are legally allowed to store and read.

## License

MIT. See [`LICENSE`](LICENSE).
