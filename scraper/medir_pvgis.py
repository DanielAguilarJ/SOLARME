#!/usr/bin/env python3
"""Mide rendimiento y forma mensual reales por ciudad contra PVGIS v5.3.

Se pide `loss=0` a proposito: PVGIS modela por su cuenta las perdidas por angulo de
incidencia, espectro y temperatura, que son fisica del sitio. Las perdidas del SISTEMA
(cableado, suciedad, inversor, desajuste) las aplica SolarMe con su propia constante
LOSS. Si pidieramos loss=14 y ademas multiplicaramos por (1-LOSS) estariamos
descontando dos veces lo mismo.

Se pide `optimalangles=1` para obtener la inclinacion optima que calcula PVGIS y poder
auditar la formula propia optTilt(lat) = lat * 0.87 contra una base de datos solar.
"""
import json
import time
import urllib.request

API = "https://re.jrc.ec.europa.eu/api/v5_3/PVcalc"

CIUDADES = [
    ("Ciudad de México", 19.4326, -99.1332, 1760),
    ("Guadalajara", 20.6597, -103.3496, 1880),
    ("Monterrey", 25.6866, -100.3161, 1710),
    ("Mérida", 20.9674, -89.5926, 1820),
    ("Tijuana", 32.5149, -117.0382, 1770),
    ("Puebla", 19.0414, -98.2063, 1800),
    ("Cancún", 21.1619, -86.8515, 1830),
]


def consulta(lat, lon):
    url = (
        f"{API}?lat={lat}&lon={lon}&peakpower=1&loss=0"
        f"&optimalangles=1&outputformat=json"
    )
    with urllib.request.urlopen(url, timeout=90) as r:
        return json.load(r)


def main():
    filas = []
    for nombre, lat, lon, inventado in CIUDADES:
        d = consulta(lat, lon)
        ent, sal = d["inputs"], d["outputs"]
        fijo = ent["mounting_system"]["fixed"]
        tot = sal["totals"]["fixed"]
        mens = [m["E_m"] for m in sal["monthly"]["fixed"]]
        filas.append(
            {
                "ciudad": nombre,
                "lat": lat,
                "lon": lon,
                "elev": ent["location"]["elevation"],
                "db": ent["meteo_data"]["radiation_db"],
                "anios": [ent["meteo_data"]["year_min"], ent["meteo_data"]["year_max"]],
                "tilt_pvgis": fijo["slope"]["value"],
                "az_pvgis": fijo["azimuth"]["value"],
                "tilt_formula": round(min(35, max(10, abs(lat) * 0.87))),
                "E_y": tot["E_y"],
                "SD_y": tot.get("SD_y"),
                "l_aoi": tot.get("l_aoi"),
                "l_tg": tot.get("l_tg"),
                "l_total": tot.get("l_total"),
                "inventado": inventado,
                "mensual": [round(x, 1) for x in mens],
            }
        )
        time.sleep(1.2)

    print(json.dumps(filas, ensure_ascii=False, indent=1))

    print("\n=== rendimiento: inventado vs medido (loss=0, angulo optimo) ===")
    print(f"{'ciudad':<18}{'inventado':>10}{'medido':>9}{'±SD':>7}{'error':>9}")
    for f in filas:
        err = (f["inventado"] - f["E_y"]) / f["E_y"] * 100
        print(
            f"{f['ciudad']:<18}{f['inventado']:>10}{f['E_y']:>9.0f}"
            f"{f['SD_y'] or 0:>7.0f}{err:>8.1f}%"
        )

    print("\n=== inclinacion optima: formula propia vs PVGIS ===")
    print(f"{'ciudad':<18}{'lat':>7}{'formula':>9}{'pvgis':>7}{'dif':>6}")
    for f in filas:
        print(
            f"{f['ciudad']:<18}{f['lat']:>7.2f}{f['tilt_formula']:>9}"
            f"{f['tilt_pvgis']:>7.0f}{f['tilt_pvgis'] - f['tilt_formula']:>6.0f}"
        )

    print("\n=== forma mensual: una fija vs la real de cada ciudad ===")
    fija = [0.085, 0.088, 0.098, 0.099, 0.096, 0.082, 0.080, 0.083, 0.076, 0.081, 0.078, 0.084]
    s = sum(fija)
    fija = [w / s for w in fija]
    meses = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]
    print(f"{'':<18}" + "".join(f"{m:>6}" for m in meses))
    print(f"{'FIJA (actual)':<18}" + "".join(f"{w * 100:>6.1f}" for w in fija))
    for f in filas:
        t = sum(f["mensual"])
        w = [x / t for x in f["mensual"]]
        peor = max(range(12), key=lambda i: abs(w[i] - fija[i]))
        print(
            f"{f['ciudad']:<18}" + "".join(f"{x * 100:>6.1f}" for x in w)
            + f"   peor mes {meses[peor]} {(fija[peor] - w[peor]) * 100:+.1f}pp"
        )

    print("\n=== amplitud estacional (mes mayor / mes menor) ===")
    for f in filas:
        print(f"{f['ciudad']:<18}{max(f['mensual']) / min(f['mensual']):>6.2f}")
    print(f"{'FIJA (actual)':<18}{max(fija) / min(fija):>6.2f}")


if __name__ == "__main__":
    main()
