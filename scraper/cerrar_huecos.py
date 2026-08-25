#!/usr/bin/env python3
"""Tercera tanda: tres ciudades elegidas para cerrar los huecos que MIDIO el analisis.

No se eligieron por poblacion ni por intuicion. Con los 93 sitios, la distancia de cada uno a
su vecino medido mas cercano dejaba tres huecos grandes, y un domicilio a medio camino del
peor queda a 171 km de cualquier fisica medida, o sea en el nivel "baja" que la app declara
como orden de magnitud:

    Ciudad Juarez -> Chihuahua      342 km
    Nogales       -> Hermosillo     250 km
    Chetumal      -> Valladolid     244 km

Se probaron candidatas una por una y estas tres bajan el hueco peor a 199 km, que deja al
domicilio peor servido a ~100 km y por tanto en "media" en vez de "baja".

Reusa `medir()` de densificar_sitios: las formulas del rendimiento, del contraste con NASA y
de la forma mensual tienen que ser LAS MISMAS que las de los otros 93, o los sitios nuevos no
serian comparables. Las temperaturas extremas las pone despues `medir_temperaturas.py`, que
solo procesa los sitios a los que les faltan.
"""
import json
import sys

sys.path.insert(0, "scraper")
from densificar_sitios import medir  # noqa: E402

RUTA = "app/src/data/sites.json"

CIUDADES = [
    # clave, nombre, lat, lng, estado, hueco que cierra
    ("villa ahumada", "Villa Ahumada", 30.6167, -106.5167, "Chihuahua", "Juarez-Chihuahua 342 km"),
    ("santa ana son", "Santa Ana", 30.5417, -111.1194, "Sonora", "Nogales-Hermosillo 250 km"),
    ("felipe carrillo puerto", "Felipe Carrillo Puerto", 19.5786, -88.0453,
     "Quintana Roo", "Chetumal-Valladolid 244 km"),
    # Cuarta: la UNICA localidad de mas de 50 mil habitantes que quedaba a mas de 150 km de
    # cualquier sitio medido. Medido contra 196 asentamientos de Wikidata deduplicados: 98.17 %
    # de esa poblacion estaba ya en "alta" y 1.78 % en "media"; Puerto Penasco era el 0.05 %.
    ("puerto penasco", "Puerto Peñasco", 31.3167, -113.5333, "Sonora",
     "unica localidad >50k en nivel baja, a 232 km"),
    # Quinta tanda: NO se eligieron por distancia sino midiendo el error real. Se pidio a PVGIS
    # el rendimiento de 14 localidades de nivel "media" y se comparo con el que la app les
    # prestaba del sitio vecino: error medio 3.99 % y maximo 10.27 %. Estas cinco pasan de 5 %,
    # y en tres de ellas el error es POSITIVO, o sea que la app prometia mas energia de la real.
    ("ciudad mante", "Ciudad Mante", 22.7425, -98.9722, "Tamaulipas", "+10.27% sobre lo real"),
    ("tuxtepec", "San Juan Bautista Tuxtepec", 18.0883, -96.1253, "Oaxaca", "+9.31%"),
    ("ciudad valles", "Ciudad Valles", 21.9865, -99.0187, "San Luis Potosí", "+8.30%"),
    ("huajuapan", "Huajuapan de León", 17.8097, -97.7764, "Oaxaca", "-6.10%"),
    ("ocotlan", "Ocotlán", 20.3467, -102.7742, "Jalisco", "+5.33% a solo 52 km"),
]


def main() -> int:
    doc = json.load(open(RUTA, encoding="utf-8"))
    sitios = doc["sitios"]
    antes = len(sitios)

    for clave, nombre, lat, lng, estado, motivo in CIUDADES:
        if clave in sitios:
            print(f"  {nombre}: ya estaba, se omite", flush=True)
            continue
        try:
            s = medir(nombre, lat, lng, estado)
        except Exception as e:
            print(f"  {nombre}: FALLO {type(e).__name__} {e}", flush=True)
            continue
        sitios[clave] = s
        print(f"  {nombre:<24} {s['rendimiento']:>7.1f} kWh/kWp  tilt {s['tiltOptimo']:>2}"
              f"  az {s['azimutOptimo']:>4}  disc {s['discrepanciaFuentes']:>6.2f}%"
              f"  [{motivo}]", flush=True)

    if len(sitios) == antes:
        print("nada nuevo: no se escribe", flush=True)
        return 1

    # Mismo formato que ya tenia el archivo, para que el diff sean los sitios y no todo el JSON.
    with open(RUTA, "w", encoding="utf-8") as f:
        json.dump(doc, f)
    print(f"sitios: {antes} -> {len(sitios)}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
