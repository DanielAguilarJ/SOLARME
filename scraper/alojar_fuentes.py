#!/usr/bin/env python3
"""Descarga Fraunces e Inter para alojarlas en el proyecto.

Motivo: `index.html` pedía la hoja de Google Fonts con un `<link rel="stylesheet">`, que
bloquea el renderizado y necesita red. En una azotea sin senal la app cae a tipografias del
sistema, y el sistema tipografico es la mitad de este diseno. Alojarlas quita la dependencia
de red, quita una peticion a un tercero en cada carga y hace que el trabajador de servicio
pueda garantizarlas sin conexion.

Se piden con un agente de navegador moderno porque Google Fonts sirve `woff2` solo si el
cliente lo declara; con un agente viejo devuelve `ttf`, que pesa del orden de cuatro veces
mas. Y se conservan solo los subconjuntos latinos: el cirilico, el griego y el vietnamita
suman mucho y esta aplicacion esta en espanol.
"""
import hashlib
import pathlib
import re
import urllib.request

UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"
)
SALIDA = pathlib.Path("app/public/fonts")
CSS_SALIDA = pathlib.Path("app/src/fonts.css")

FAMILIAS = (
    "https://fonts.googleapis.com/css2"
    "?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600"
    "&family=Inter:wght@400;450;500;600;700"
    "&display=swap"
)

# se guardan solo estos subconjuntos
LATINOS = {"latin", "latin-ext"}


def pide(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def main() -> int:
    SALIDA.mkdir(parents=True, exist_ok=True)
    css = pide(FAMILIAS).decode("utf-8")

    bloques = re.findall(r"/\*\s*([\w-]+)\s*\*/\s*(@font-face\s*\{[^}]+\})", css)
    if not bloques:
        print("no reconoci la forma de la hoja; se aborta sin tocar nada")
        return 1

    salida_css: list[str] = [
        "/* Tipografias alojadas en el proyecto.",
        " *",
        " * Generado por scraper/alojar_fuentes.py. Antes se pedian a Google Fonts con un",
        " * `<link rel=\"stylesheet\">`, que bloquea el renderizado y exige red: sin senal la app",
        " * caia a tipografias del sistema. Ahora viajan dentro y el trabajador de servicio las",
        " * puede garantizar sin conexion. Solo subconjuntos latinos, en woff2.",
        " */",
        "",
    ]
    total = 0
    guardados = 0
    # Fraunces e Inter son tipografias VARIABLES: Google sirve el MISMO binario para cada peso
    # declarado. Sin deduplicar se descargaban 1025 KB, de los que 800 eran copias del mismo
    # archivo. Se indexa por huella del contenido y las declaraciones comparten archivo.
    porHuella: dict[str, str] = {}

    for subset, bloque in bloques:
        if subset not in LATINOS:
            continue
        m = re.search(r"url\((https://[^)]+\.woff2)\)", bloque)
        fam = re.search(r"font-family:\s*'([^']+)'", bloque)
        peso = re.search(r"font-weight:\s*([\d\s]+);", bloque)
        if not (m and fam):
            continue
        url = m.group(1)
        datos = pide(url)
        huella = hashlib.sha256(datos).hexdigest()[:8]
        if huella in porHuella:
            nombre = porHuella[huella]
        else:
            nombre = f"{fam.group(1).lower()}-{subset}-{huella}.woff2"
            (SALIDA / nombre).write_bytes(datos)
            porHuella[huella] = nombre
            total += len(datos)
        guardados += 1
        salida_css.append(bloque.replace(url, f"/fonts/{nombre}").strip())
        salida_css.append("")

    CSS_SALIDA.write_text("\n".join(salida_css), encoding="utf-8")
    print(f"{guardados} declaraciones sobre {len(porHuella)} archivos distintos, "
          f"{total / 1024:.0f} KB en {SALIDA}")
    for f in sorted(SALIDA.iterdir()):
        print(f"  {f.stat().st_size / 1024:6.1f} KB  {f.name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
