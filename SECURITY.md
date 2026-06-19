# Security policy

Manga Reader Selfhosted is intended for personal/private use.

## Supported versions

Security fixes are handled on the `main` branch.

## Recommended deployment

- Set `APP_PASSWORD` before exposing the app to any network.
- Prefer a private network such as Tailscale for remote access.
- Avoid exposing port `3001` directly to the public internet.
- Do not commit `.env`, SQLite databases, uploaded archives, extracted pages, thumbnails, backups, API keys, or tokens.
- Back up `DATA_DIR`, `STORAGE_DIR`, and `.env` privately.

## Reporting security issues

If you find a security issue, please open a GitHub issue without including private credentials, tokens, database files, manga archives, or personal library data.

If the issue includes sensitive details, contact the maintainer privately first.
