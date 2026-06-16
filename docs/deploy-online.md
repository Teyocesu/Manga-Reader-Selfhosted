# Deploy online privado

Esta app puede correr como lector web privado usando un solo proceso Node/Express. En produccion, Express sirve la API y el build de React desde `client/dist`.

## Requisitos

- Node 24 o superior.
- Un disco persistente para `data/` y `storage/`.
- Una contraseña en `APP_PASSWORD` si vas a exponer la app online.

No subas mangas, base de datos, miniaturas ni storage al repo. El repo debe contener solo codigo y configuracion.

## Variables de entorno

```text
PORT=3001
DATA_DIR=./data
STORAGE_DIR=./storage
MAX_UPLOAD_MB=1024
MAX_IMAGES_PER_CHAPTER=1000
APP_PASSWORD=una-contraseña-larga
NODE_ENV=production
```

`DATA_DIR` guarda SQLite. `STORAGE_DIR` guarda imagenes extraidas, temporales y miniaturas. Ambos deben apuntar a una ruta persistente del hosting.

Para cambiar la contraseña de acceso, editá `APP_PASSWORD` en el `.env` local o en las variables del hosting y reiniciá el servicio. Ejemplo seguro:

```text
APP_PASSWORD=tu_password_nuevo
```

No subas `.env` a GitHub ni pegues la contraseña real en commits, logs o tickets. Si `APP_PASSWORD` queda vacío, la app puede quedar sin login; no lo dejes vacío en una URL expuesta.

## Build y start

```bash
npm install
npm run build
npm run start
```

En produccion, abrir la URL del hosting. En local, si usas el puerto por defecto:

```text
http://localhost:3001
```

## Hosting recomendado

Render, Railway, Fly.io o un VPS sirven para esta app si configuras un volumen/disco persistente.

- Render: crear Web Service Node y montar Persistent Disk. Apuntar `DATA_DIR` y `STORAGE_DIR` al disco.
- Railway: usar un volumen persistente y configurar las variables de entorno.
- Fly.io: usar volume y configurar mounts para datos/storage.
- VPS: usar systemd, pm2 o similar, y respaldar periodicamente `DATA_DIR` y `STORAGE_DIR`.

Vercel solo no conviene para esta app porque su filesystem no es persistente para uploads y SQLite. Podrias usar Vercel solo con storage/base de datos externos, pero eso queda fuera de este MVP.

## iPhone

1. Abrir la URL privada desde Safari.
2. Ingresar la contraseña de la app.
3. Tocar Compartir.
4. Elegir `Agregar a pantalla de inicio`.

Esto no convierte la app en PWA; solo crea un acceso directo comodo.

## Backups

Respaldar estas carpetas:

- `DATA_DIR`
- `STORAGE_DIR`

Sin esas carpetas persistidas, perderias biblioteca, progreso, paginas extraidas y miniaturas.
