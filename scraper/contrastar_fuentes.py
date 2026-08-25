#!/usr/bin/env python3
"""Contrasta cada sitio contra una segunda fuente independiente y guarda el desacuerdo.

PVGIS usa el reanalisis ERA5. NASA POWER usa MERRA-2 con CERES. Donde coinciden, la cifra
es solida. Donde discrepan, el producto NO debe elegir en silencio: guarda las dos, marca
la discrepancia y se queda con la MENOR.

El criterio no es estadistico sino comercial. La cifra termina en una propuesta firmada:
sobreestimar la produccion produce un sistema que no cumple lo prometido, y eso es lo que
destruye a un instalador. Subestimar cuesta una venta pero no rompe un compromiso.
"""
import json
import time
import urllib.request

RUTA = "app/src/data/sites.json"
UMBRAL = 3.0  # % de discrepancia a partir del cual se degrada a la fuente menor


def ghi_pvgis(lat, lon):
    u = (f"https://re.jrc.ec.europa.eu/api/v5_3/PVcalc?lat={lat}&lon={lon}"
         "&peakpower=1&loss=0&angle=0&aspect=0&outputformat=json")
    with urllib.request.urlopen(u, timeout=90) as r:
        return json.load(r)["outputs"]["totals"]["fixed"]["H(i)_y"]


def ghi_nasa(lat, lon):
    u = ("https://power.larc.nasa.gov/api/temporal/climatology/point"
         "?parameters=ALLSKY_SFC_SW_DWN&community=RE"
         f"&longitude={lon}&latitude={lat}&format=JSON")
    with urllib.request.urlopen(u, timeout=90) as r:
        d = json.load(r)
    return d["properties"]["parameter"]["ALLSKY_SFC_SW_DWN"]["ANN"] * 365


def main():
    doc = json.load(open(RUTA, encoding="utf-8"))
    print(f"{'ciudad':<18}{'PVGIS':>8}{'NASA':>8}{'discr':>8}{'rend':>8}{'usado':>8}{'fuente':>12}")
    for clave, s in doc["sitios"].items():
        gp = ghi_pvgis(s["lat"], s["lng"])
        time.sleep(0.8)
        gn = ghi_nasa(s["lat"], s["lng"])
        time.sleep(0.8)

        discrepancia = (gp - gn) / gn * 100
        factor = min(1.0, gn / gp)
        degradado = abs(discrepancia) > UMBRAL and factor < 1.0
        # el factor se aplica SOLO si de verdad se degrada. Aplicarlo siempre marcaba
        # sitios como "concuerdan" mientras les bajaba la cifra medio por ciento: la
        # etiqueta y el numero decian cosas distintas.
        conservador = round(s["rendimientoSur"] * (factor if degradado else 1.0), 1)

        s["ghiPvgis"] = round(gp, 1)
        s["ghiNasa"] = round(gn, 1)
        s["discrepanciaFuentes"] = round(discrepancia, 2)
        s["factorConservador"] = round(factor, 4)
        s["rendimientoUsado"] = conservador
        s["fuenteRendimiento"] = "menor-de-dos" if degradado else "concuerdan"

        print(f"{s['nombre'][:17]:<18}{gp:>8.0f}{gn:>8.0f}{discrepancia:>+7.1f}%"
              f"{s['rendimiento']:>8.0f}{s['rendimientoUsado']:>8.0f}"
              f"{s['fuenteRendimiento']:>12}")

    doc["contraste"] = {
        "segundaFuente": "NASA POWER (MERRA-2 / CERES), climatología anual",
        "umbralDiscrepancia": UMBRAL,
        "criterio": "si las fuentes discrepan más del umbral se usa la menor",
    }
    with open(RUTA, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, indent=1)
    print(f"\nactualizado {RUTA}")


if __name__ == "__main__":
    main()
