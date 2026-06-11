# Fixtures manuales de upload

Estos fixtures usan imagenes diminutas generadas localmente, sin contenido externo.

## ZIP / CBZ

```bash
mkdir -p /tmp/manga-reader-fixture/pages
node -e "const fs=require('node:fs'); const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=','base64'); fs.writeFileSync('/tmp/manga-reader-fixture/pages/1.png',png); fs.writeFileSync('/tmp/manga-reader-fixture/pages/2.png',png); fs.writeFileSync('/tmp/manga-reader-fixture/pages/10.png',png);"
zip -j /tmp/manga-reader-fixture/chapter.cbz /tmp/manga-reader-fixture/pages/1.png /tmp/manga-reader-fixture/pages/2.png /tmp/manga-reader-fixture/pages/10.png
```

Subir `chapter.cbz` desde la pantalla `Subir`. El campo `Título base` es opcional; si queda vacio, se usa el nombre del archivo.

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

## Pack con varios capitulos

Si un archive externo contiene varios archives internos soportados y no contiene imagenes directas, la app lo importa como pack. Cada archive interno queda como un capitulo separado bajo el manga ingresado.

Para crear un fixture local `.zip` con dos `.cbz` adentro:

```bash
cp /tmp/manga-reader-fixture/chapter.cbz /tmp/manga-reader-fixture/chapter-01.cbz
cp /tmp/manga-reader-fixture/chapter.cbz /tmp/manga-reader-fixture/chapter-02.cbz
zip -j /tmp/manga-reader-fixture/pack.zip /tmp/manga-reader-fixture/chapter-01.cbz /tmp/manga-reader-fixture/chapter-02.cbz
```

Subir `pack.zip`. La respuesta debe indicar 2 capitulos y 6 paginas.
Si se sube el mismo pack otra vez para el mismo manga, la respuesta debe indicar que esos capitulos ya existian y no crear copias nuevas.

Si hay imagenes y archives internos mezclados, el upload se rechaza con un error claro. Si un archive interno trae otro archive adentro, se rechaza para mantener profundidad maxima 1.
