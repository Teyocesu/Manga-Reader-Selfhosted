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

## Configuracion opcional

Crear `.env` desde `.env.example` si queres cambiar limites locales:

```bash
cp .env.example .env
```

Valores por defecto:

```text
MAX_UPLOAD_MB=1024
MAX_IMAGES_PER_CHAPTER=1000
```

El limite de upload no es ilimitado: si un archivo supera `MAX_UPLOAD_MB`, la API responde con un error claro.

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

El backend escucha en `0.0.0.0` para que otros dispositivos de la misma red puedan conectarse. El frontend de Vite tambien se levanta con `--host 0.0.0.0`.

## Uso basico

1. Abrir `http://localhost:5173`.
2. Entrar en `Subir`.
3. Completar titulo de manga, opcionalmente un titulo base, y elegir un archivo `.zip`, `.cbz`, `.rar` o `.cbr`.
4. Abrir el manga desde la biblioteca.
5. Entrar al capitulo.
6. Leer en modo `Pagina` o `Webtoon`.

El progreso se guarda automaticamente en SQLite.
Si el titulo base queda vacio, la importacion usa el nombre del archivo. En packs, cada capitulo usa el nombre sanitizado del archive interno. Si ya existe un capitulo con el mismo titulo dentro del manga, se omite para evitar duplicados visibles.

El lector incluye modo inmersivo, pantalla completa si el navegador lo permite, salto directo a pagina, progreso visible y atajos: flechas izquierda/derecha en modo pagina, `H` para ocultar/mostrar UI y `F` para pantalla completa.
Desde el detalle se pueden borrar capitulos o el manga completo con confirmacion. Si se borra el ultimo capitulo, el manga queda vacio para que puedas decidir si conservarlo o borrarlo completo.

## Archivos locales

- Base de datos: `data/manga-reader.sqlite`
- Imagenes extraidas: `storage/library/`
- Miniaturas generadas: `storage/thumbnails/`
- Temporales de upload/extraccion: `storage/.tmp/`

`data/` y `storage/` no se versionan, salvo sus `.gitkeep`.

## Alcance del MVP

- Subida de archivos `.zip`, `.cbz`, `.rar` y `.cbr` propios.
- Extraccion local de imagenes en `storage/`.
- Metadata y progreso en SQLite dentro de `data/`.
- Miniaturas automaticas desde archivos locales subidos, sin busquedas online.
- Biblioteca, detalle de manga/capitulo y lector con modo pagina/webtoon.
- Acceso desde celular en la misma red local.

No incluye scraping, descargas externas, login, Docker, PWA ni deploy externo.

## Formatos soportados

- `.zip` y `.cbz`: lectura con `yauzl`.
- `.rar` y `.cbr`: lectura con `node-unrar-js`.
- Imagenes directas dentro de `.zip`, `.cbz`, `.rar` o `.cbr`.
- Un nivel de archive anidado, por ejemplo `.rar` con un `.cbr` adentro o `.zip` con un `.cbz` adentro.
- Packs con varios archives internos soportados y sin imagenes directas. Cada archive interno se importa como un capitulo separado.

Para probar `.rar` o `.cbr`, usa siempre un archivo RAR valido propio o legalmente obtenido.

Para RAR se eligio `node-unrar-js` porque funciona en Node sin instalar binarios externos. Su ultima version publicada no es reciente, pero es mas simple y segura para este MVP que depender de herramientas del sistema o de alternativas mas antiguas como `unrar-js`.

Si mezcla imagenes y archives internos, la app rechaza el upload para evitar ambiguedades. Si un archive interno trae otro archive adentro, se rechaza para mantener profundidad maxima 1.

## API minima

- `GET /api/health`
- `GET /api/library`
- `GET /api/mangas/:mangaId`
- `GET /api/mangas/:mangaId/thumbnail`
- `DELETE /api/mangas/:mangaId`
- `GET /api/chapters/:chapterId`
- `DELETE /api/chapters/:chapterId`
- `POST /api/upload`
- `GET /api/pages/:pageId/image`
- `GET /api/progress/:chapterId`
- `PUT /api/progress/:chapterId`

## GitHub remoto manual

Si `gh` esta instalado y autenticado, se puede crear el remoto privado con:

```bash
gh repo create manga-reader-selfhosted --private --source=. --remote=origin
```

No hagas push si `origin` no coincide con:

```text
https://github.com/Teyocesu/manga-reader-selfhosted.git
```
