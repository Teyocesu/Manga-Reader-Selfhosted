# Fixtures manuales de upload

Estos fixtures usan imagenes diminutas generadas localmente, sin contenido externo.

## ZIP / CBZ

```bash
mkdir -p /tmp/manga-reader-fixture/pages
node -e "const fs=require('node:fs'); const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=','base64'); fs.writeFileSync('/tmp/manga-reader-fixture/pages/1.png',png); fs.writeFileSync('/tmp/manga-reader-fixture/pages/2.png',png); fs.writeFileSync('/tmp/manga-reader-fixture/pages/10.png',png);"
zip -j /tmp/manga-reader-fixture/chapter.cbz /tmp/manga-reader-fixture/pages/1.png /tmp/manga-reader-fixture/pages/2.png /tmp/manga-reader-fixture/pages/10.png
```

Subir `chapter.cbz` desde la pantalla `Subir`.

## RAR / CBR

Para esta prueba usa siempre un archivo RAR valido propio o legalmente obtenido.

Esta Mac no trae una herramienta para crear RAR por defecto. Si tenes `rar` instalado localmente:

```bash
rar a -ep /tmp/manga-reader-fixture/chapter.cbr /tmp/manga-reader-fixture/pages/1.png /tmp/manga-reader-fixture/pages/2.png /tmp/manga-reader-fixture/pages/10.png
```

Subir `chapter.cbr` desde la pantalla `Subir`.

El lector tambien acepta `.rar`; `.cbr` se trata como un archivo RAR con extension de comic.

## Archive anidado

La app soporta un solo nivel de archive anidado. Ejemplos validos:

- `.rar` con un `.cbr` adentro.
- `.zip` con un `.cbz` adentro.
- `.rar` con un `.zip` adentro.
- `.zip` con un `.rar` adentro.

Para crear un fixture local `.zip` con `.cbz` adentro:

```bash
zip -j /tmp/manga-reader-fixture/nested.zip /tmp/manga-reader-fixture/chapter.cbz
```

Si hay varios archives internos, extrae uno y subilo por separado. Si hay imagenes y archives internos mezclados, el upload se rechaza con un error claro.
