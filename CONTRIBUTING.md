# Contributing

Thanks for checking out Manga Reader Selfhosted.

## Project scope

This project is a personal, self-hosted reader for user-provided archives. Contributions should stay within that scope.

Accepted scope:

- Better reader UX.
- Better import handling for user-owned archives.
- Performance and storage improvements.
- Safer authentication and private deployment options.
- Documentation improvements.

Out of scope:

- Scraping websites.
- Downloading manga from third-party sources.
- Bundling copyrighted content.
- Public catalog or piracy integrations.

## Local setup

```bash
git clone https://github.com/Teyocesu/Manga-Reader-Selfhosted.git
cd Manga-Reader-Selfhosted
npm ci
cp .env.example .env
npm run dev
```

Open:

```text
http://localhost:5173
```

## Before submitting changes

Run:

```bash
npm run build
```

Also test the server health endpoint:

```bash
npm run start
curl -i http://localhost:3001/api/health
```

## Pull request guidelines

- Keep changes focused.
- Do not commit `.env`, databases, uploads, thumbnails, or test manga archives.
- Document new environment variables in `.env.example` and `README.md`.
- Include screenshots for UI changes when useful.
- Explain migration steps if a change affects existing libraries.
