#!/usr/bin/env python3
"""Anade a cada sitio la temperatura ambiente media PONDERADA POR PRODUCCION.

Por que hace falta: el coeficiente termico del modulo influye en el puntaje del recomendador
pero NO en la energia. Un instalador en Mexicali que elige un modulo que aguanta mejor el calor
ve el mismo kWh que con uno malo, o sea que la recomendacion no tiene consecuencia en el numero
que ve el cliente. Para que la tenga hace falta saber que tan caliente trabaja el modulo ahi.

Que NO se puede hacer: aplicar el coeficiente completo del modulo. El rendimiento que ya medimos
de PVGIS incluye el efecto de temperatura de SU modulo de referencia (modelo de Huld, silicio
cristalino, k3'=-0.004702, k6'=0.000005 -> unos -0.47 %/C a 25 C). Aplicarlo otra vez seria
duplicar, el mismo error que ya se cometio con las perdidas del 14 %. Lo unico legitimo es la
DIFERENCIA entre el coeficiente del modulo y el de esa referencia.

Que se mide aqui: la media mensual de T2M (temperatura del aire a 2 m) de NASA POWER, de la que
luego se saca un promedio ponderado por la produccion mensual medida del propio sitio. Se pondera
porque lo que importa no es el promedio del ano sino el aire que hay cuando el sistema produce:
en Chihuahua enero es frio pero tambien aporta poco.

Se usa la climatologia mensual, no la serie diaria, porque aqui SI queremos el promedio: el
extremo ya se midio aparte para el dimensionado de strings, donde el modo de falla es distinto.
"""
import json
import time
import urllib.request

RUTA = "app/src/data/sites.json"
INICIO = "2015"
FIN = "2024"


def mensual(lat: float, lon: float) -> list[float]:
    """Doce medias mensuales de temperatura del aire, en grados Celsius."""
    u = ("https://power.larc.nasa.gov/api/temporal/monthly/point"
         f"?parameters=T2M&community=RE&longitude={lon}&latitude={lat}"
         f"&start={INICIO}&end={FIN}&format=JSON")
    for intento in range(4):
        try:
            with urllib.request.urlopen(u, timeout=120) as r:
                d = json.load(r)
            crudo = d["properties"]["parameter"]["T2M"]
            # NASA devuelve claves AAAAMM y ademas AAAA13 (media anual): esa se descarta.
            por_mes: list[list[float]] = [[] for _ in range(12)]
            for clave, v in crudo.items():
                if v is None or v < -90:
                    continue
                mes = int(clave[-2:])
                if 1 <= mes <= 12:
                    por_mes[mes - 1].append(v)
            if any(len(m) == 0 for m in por_mes):
                raise ValueError("faltan meses")
            return [round(sum(m) / len(m), 1) for m in por_mes]
        except Exception:
            if intento == 3:
                raise
            time.sleep(5)
    return []


def main() -> None:
    with open(RUTA) as f:
        datos = json.load(f)
    sitios = list(datos["sitios"].values())

    for i, s in enumerate(sitios, 1):
        if "tMediaMensual" in s:
            continue
        try:
            t = mensual(s["lat"], s["lng"])
        except Exception as e:
            print(f"  [{i}/{len(sitios)}] {s['nombre']}: FALLO {e}", flush=True)
            continue

        # Promedio ponderado por la produccion mensual medida del propio sitio. `mensual` son
        # fracciones del total anual, asi que ya suman 1 y sirven directamente como pesos.
        pesos = s["mensual"]
        total = sum(pesos)
        s["tMediaMensual"] = t
        s["tMediaSol"] = round(sum(a * b for a, b in zip(t, pesos)) / total, 1)
        # Cuanto se separa de la media simple del ano: mide si ponderar cambia algo.
        simple = sum(t) / 12
        print(f"  [{i}/{len(sitios)}] {s['nombre']}: ponderada {s['tMediaSol']} C "
              f"(simple {simple:.1f}) rango {min(t)}-{max(t)}", flush=True)

        with open(RUTA, "w") as f:
            json.dump(datos, f, ensure_ascii=False, indent=1)
        time.sleep(0.4)

    con = [s for s in sitios if "tMediaSol" in s]
    if con:
        frio = min(con, key=lambda s: s["tMediaSol"])
        calor = max(con, key=lambda s: s["tMediaSol"])
        print(f"\n{len(con)}/{len(sitios)} sitios con temperatura media de operacion")
        print(f"  mas fresco:  {frio['nombre']} {frio['tMediaSol']} C")
        print(f"  mas caliente: {calor['nombre']} {calor['tMediaSol']} C")


if __name__ == "__main__":
    main()
