# Manga Reader Selfhosted

Lector web self-hosted para manga/manhwa personal, pensado para correr en una Mac y abrirse desde un celular en la misma red Wi-Fi.

## Requisitos

- macOS
- Node.js 24 o superior
- npm

## Instalacion

```bash
npm install
```

## Desarrollo

Levantar backend y frontend juntos:

```bash
npm run dev
```

Levantar solo backend:

```bash
npm run dev:server
```

Levantar solo frontend:

```bash
npm run dev:client
```

Puertos por defecto:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3001`
- Health check: `http://localhost:3001/api/health`

## Alcance del MVP

- Subida de archivos `.zip` y `.cbz` propios.
- Extraccion local de imagenes en `storage/`.
- Metadata y progreso en SQLite dentro de `data/`.
- Biblioteca, detalle de manga/capitulo y lector con modo pagina/webtoon.
- Acceso desde celular en la misma red local.

No incluye scraping, descargas externas, login, Docker, PWA ni deploy externo.

## GitHub remoto manual

Si `gh` esta instalado y autenticado, se puede crear el remoto privado con:

```bash
gh repo create manga-reader-selfhosted --private --source=. --remote=origin
```

No hagas push si `origin` no coincide con:

```text
https://github.com/Teyocesu/manga-reader-selfhosted.git
```
