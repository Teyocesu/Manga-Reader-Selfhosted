# Deployment guide

This guide shows a simple way to run Manga Reader Selfhosted on a small Linux server or cloud VM.

Recommended setup:

- Run the app on a private machine or VM.
- Configure a real `APP_PASSWORD` in `.env`.
- Keep your manga files, database, thumbnails, and `.env` outside Git.
- Prefer private networking, such as Tailscale, instead of exposing the app directly to the public internet.

## Server requirements

- Linux server or VM
- Node.js 24+
- npm
- Git
- Enough disk space for your library

For very small VMs, swap can help during dependency installation and frontend builds.

## Install and run

```bash
git clone https://github.com/Teyocesu/Manga-Reader-Selfhosted.git
cd Manga-Reader-Selfhosted
npm ci
cp .env.example .env
npm run build
npm run start
```

Health check:

```bash
curl -i http://localhost:3001/api/health
```

## Persistent data paths

On a server, prefer data directories outside the repository. Example:

```text
DATA_DIR=/opt/manga-reader/data
STORAGE_DIR=/opt/manga-reader/storage
```

The app data you should back up is:

```text
DATA_DIR
STORAGE_DIR
.env
```

Do not publish those files.

## Process manager

For a Linux server, keep the app running with PM2:

```bash
sudo npm install -g pm2
pm2 start "npm run start" --name manga-reader
pm2 save
pm2 startup
```

Run the startup command printed by PM2, then save again:

```bash
pm2 save
```

Verify:

```bash
pm2 status
curl -i http://localhost:3001/api/health
```

## Private access

A private mesh/VPN is the recommended way to access the app remotely.

If your private network gives the server an address like `100.x.y.z`, open:

```text
http://100.x.y.z:3001
```

Your phone or laptop must be connected to the same private network.

## Updating

```bash
git pull origin main
npm ci
npm run build
pm2 restart manga-reader
pm2 save
```
