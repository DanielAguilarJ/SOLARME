#!/usr/bin/env python3
"""Anade a cada sitio las temperaturas extremas medidas, para dimensionar strings.

Por que hace falta: el voltaje de circuito abierto de un modulo SUBE cuando baja la
temperatura (`betaVoc` es negativo). Un string dimensionado con la temperatura promedio
puede rebasar el voltaje maximo del inversor la primera manana fria del ano y destruirlo. La
norma no pide el promedio: pide el EXTREMO del sitio.

Se toma la serie DIARIA de NASA POWER de los ultimos diez anos, no la climatologia mensual,
porque el extremo es exactamente lo que un promedio esconde. Se guardan tres cifras:

  tMinAbs   el minimo absoluto medido en la serie. Es el criterio conservador y el que usa el
            calculo, porque el modo de falla es destruir un inversor.
  tMinAshrae el percentil 0.4 % de las minimas diarias, que es el criterio codificado que
            citan las normas de instalacion. Se guarda para poder mostrar la diferencia.
  tMaxAbs   el maximo absoluto, que sirve para el otro extremo: el string tambien tiene que
            mantenerse POR ENCIMA del minimo de arranque del inversor con el modulo caliente.
"""
import json
import time
import urllib.request

RUTA = "app/src/data/sites.json"
INICIO = "20150101"
FIN = "20241231"


def serie(lat: float, lon: float, parametro: str) -> list[float]:
    u = ("https://power.larc.nasa.gov/api/temporal/daily/point"
         f"?parameters={parametro}&community=RE"
         f"&longitude={lon}&latitude={lat}&start={INICIO}&end={FIN}&format=JSON")
    for intento in range(4):
        try:
            with urllib.request.urlopen(u, timeout=120) as r:
                d = json.load(r)
            vals = d["properties"]["parameter"][parametro].values()
            # NASA marca los faltantes con -999
            return sorted(v for v in vals if v is not None and v > -90)
        except Exception:
            if intento == 3:
                raise
            time.sleep(5)
    return []


def main() -> int:
    doc = json.load(open(RUTA, encoding="utf-8"))
    sitios = doc["sitios"]
    pendientes = [(k, v) for k, v in sitios.items() if "tMinAbs" not in v]
    print(f"por medir: {len(pendientes)} de {len(sitios)}", flush=True)

    for i, (clave, s) in enumerate(pendientes, 1):
        try:
            minimas = serie(s["lat"], s["lng"], "T2M_MIN")
            time.sleep(0.6)
            maximas = serie(s["lat"], s["lng"], "T2M_MAX")
            if not minimas or not maximas:
                print(f"[{i}] {s['nombre']}: sin serie, se omite", flush=True)
                continue
            s["tMinAbs"] = round(minimas[0], 1)
            s["tMinAshrae"] = round(minimas[int(len(minimas) * 0.004)], 1)
            s["tMaxAbs"] = round(maximas[-1], 1)
            s["diasSerie"] = len(minimas)
            print(f"[{i}/{len(pendientes)}] {s['nombre']:<22}"
                  f"min abs {s['tMinAbs']:>6.1f}  ASHRAE {s['tMinAshrae']:>6.1f}  "
                  f"max {s['tMaxAbs']:>5.1f}", flush=True)
        except Exception as e:
            print(f"[{i}] {s['nombre']}: FALLO {e}", flush=True)
            continue
        with open(RUTA, "w", encoding="utf-8") as f:
            json.dump(doc, f, ensure_ascii=False, indent=1)
        time.sleep(0.6)

    doc["temperaturas"] = {
        "fuente": "NASA POWER, serie diaria T2M_MIN y T2M_MAX",
        "periodo": f"{INICIO}–{FIN}",
        "criterio": ("tMinAbs es el minimo absoluto medido y es el que usa el calculo; "
                     "tMinAshrae es el percentil 0.4 % que citan las normas"),
    }
    with open(RUTA, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, indent=1)

    con = [v for v in sitios.values() if "tMinAbs" in v]
    print(f"\n{len(con)} de {len(sitios)} sitios con temperaturas extremas")
    if con:
        fr = min(con, key=lambda v: v["tMinAbs"])
        ca = max(con, key=lambda v: v["tMaxAbs"])
        print(f"  mas frio:  {fr['nombre']} {fr['tMinAbs']} C")
        print(f"  mas caliente: {ca['nombre']} {ca['tMaxAbs']} C")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
