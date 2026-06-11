# Uso desde celular en la misma Wi-Fi

## 1. Levantar la app en la Mac

Desde la carpeta del proyecto:

```bash
npm run dev
```

El frontend queda disponible en el puerto `5173` y el backend en el puerto `3001`.

No cierres la Terminal mientras estes leyendo desde el celular.

Formatos soportados para upload local:

- `.zip`
- `.cbz`
- `.rar`
- `.cbr`

Los archivos pueden contener imagenes directamente, un unico archive interno soportado o un pack con varios archives internos. En un pack, cada `.cbz`, `.cbr`, `.zip` o `.rar` interno se importa como un capitulo separado.

## 2. Obtener la IP local de la Mac

En macOS, abrir Terminal y ejecutar:

```bash
ipconfig getifaddr en0
```

Si no devuelve nada, probar:

```bash
ipconfig getifaddr en1
```

La IP suele tener un formato parecido a `192.168.1.25`.

## 3. Abrir desde el celular

Con la Mac y el celular conectados a la misma red Wi-Fi, abrir en el navegador del celular:

```text
http://IP_LOCAL_DE_LA_MAC:5173
```

Ejemplo:

```text
http://192.168.1.25:5173
```

La app del celular va a llamar automaticamente al backend en:

```text
http://IP_LOCAL_DE_LA_MAC:3001
```

## Problemas comunes

- Confirmar que Mac y celular esten en la misma red Wi-Fi.
- Revisar que el firewall de macOS permita conexiones entrantes para Node.js.
- Si el navegador del celular no carga, probar primero desde la Mac con `http://localhost:5173`.
- Si la biblioteca carga pero las imagenes no, revisar que el backend siga activo en `http://localhost:3001/api/health`.
- No hace falta internet externo; el acceso es dentro de la red local.
