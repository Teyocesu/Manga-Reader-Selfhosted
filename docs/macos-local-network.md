# Uso desde celular en la misma Wi-Fi

## 1. Levantar la app en la Mac

Desde la carpeta del proyecto:

```bash
npm run dev
```

El frontend queda disponible en el puerto `5173` y el backend en el puerto `3001`.

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

## Problemas comunes

- Confirmar que Mac y celular esten en la misma red Wi-Fi.
- Revisar que el firewall de macOS permita conexiones entrantes para Node.js.
- No hace falta internet externo; el acceso es dentro de la red local.
