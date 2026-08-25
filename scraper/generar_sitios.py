#!/usr/bin/env python3
"""Genera app/src/data/sites.json: fisica MEDIDA por ciudad, no interpolada.

Contra PVGIS v5.3 (Comision Europea). Todo con `loss=0` porque PVGIS ya modela las
perdidas del SITIO (angulo de incidencia, espectro, temperatura) y las perdidas del
SISTEMA las aplica SolarMe con su constante LOSS. Pedir loss=14 y ademas multiplicar por
(1-LOSS) descuenta dos veces lo mismo.

Cada ciudad guarda:
  - rendimiento en su orientacion optima real (kWh/kWp/ano) y la desviacion interanual
  - la inclinacion y el azimut optimos MEDIDOS, que no son funcion de la latitud:
    Merida y Guadalajara distan 0.3 grados de latitud y 3 grados de inclinacion optima
  - el reparto mensual real, que en Tijuana y CDMX son estaciones opuestas
  - la perdida medida por desviar el azimut, que crece con la latitud y NO es simetrica:
    en el centro de Mexico el oriente rinde mas que el poniente
"""
import json
import time
import urllib.request

API = "https://re.jrc.ec.europa.eu/api/v5_3/PVcalc"
SALIDA = "app/src/data/sites.json"

CIUDADES = [
    ("cdmx", "Ciudad de México", 19.4326, -99.1332),
    ("guadalajara", "Guadalajara", 20.6597, -103.3496),
    ("monterrey", "Monterrey", 25.6866, -100.3161),
    ("merida", "Mérida", 20.9674, -89.5926),
    ("tijuana", "Tijuana", 32.5149, -117.0382),
    ("puebla", "Puebla", 19.0414, -98.2063),
    ("cancun", "Cancún", 21.1619, -86.8515),
]

AZIMUTS = [-90, -75, -60, -45, -30, -15, 0, 15, 30, 45, 60, 75, 90]
DESVIOS_TILT = [-20, -15, -10, -5, 0, 5, 10, 15, 20, 30]


def pide(**kw):
    q = "&".join(f"{k}={v}" for k, v in kw.items())
    url = f"{API}?lat={kw['lat']}&lon={kw['lon']}&peakpower=1&loss=0&outputformat=json&{q}"
    for intento in range(4):
        try:
            with urllib.request.urlopen(url, timeout=90) as r:
                return json.load(r)
        except Exception:
            if intento == 3:
                raise
            time.sleep(4)


def main():
    sitios = {}
    for clave, nombre, lat, lon in CIUDADES:
        print(f"midiendo {nombre}...", flush=True)
        base = pide(lat=lat, lon=lon, optimalangles=1)
        ent, sal = base["inputs"], base["outputs"]
        fijo = ent["mounting_system"]["fixed"]
        tilt_opt = round(fijo["slope"]["value"])
        az_opt = round(fijo["azimuth"]["value"])
        tot = sal["totals"]["fixed"]

        mensual = [round(m["E_m"], 1) for m in sal["monthly"]["fixed"]]
        total_m = sum(mensual)

        time.sleep(0.8)
        perdida_az = {}
        for a in AZIMUTS:
            e = pide(lat=lat, lon=lon, angle=tilt_opt, aspect=a)
            perdida_az[a] = e["outputs"]["totals"]["fixed"]["E_y"]
            time.sleep(0.7)

        # referencia al sur exacto: es lo que el instalador describe y lo que el
        # modelo llama az=180. El optimo real puede estar unos grados al oriente.
        sur = perdida_az[0]
        perdida_rel = {a: round((sur - v) / sur * 100, 2) for a, v in perdida_az.items()}

        perdida_tilt = {}
        for d in DESVIOS_TILT:
            t = tilt_opt + d
            if t < 0 or t > 60:
                continue
            e = pide(lat=lat, lon=lon, angle=t, aspect=0)
            perdida_tilt[d] = e["outputs"]["totals"]["fixed"]["E_y"]
            time.sleep(0.7)
        pico_t = max(perdida_tilt.values())
        perdida_tilt_rel = {d: round((pico_t - v) / pico_t * 100, 2)
                            for d, v in perdida_tilt.items()}

        sitios[clave] = {
            "nombre": nombre,
            "lat": lat,
            "lng": lon,
            "elevacion": ent["location"]["elevation"],
            "rendimiento": round(tot["E_y"], 1),
            "desviacionInteranual": round(tot.get("SD_y") or 0, 1),
            "tiltOptimo": tilt_opt,
            "azimutOptimo": az_opt,
            "rendimientoSur": round(sur, 1),
            "mensual": [round(x / total_m, 5) for x in mensual],
            "mensualKwh": mensual,
            "perdidaAzimut": perdida_rel,
            "perdidaTilt": perdida_tilt_rel,
            "perdidas": {
                "anguloIncidencia": tot.get("l_aoi"),
                "temperaturaIrradiancia": tot.get("l_tg"),
                "total": tot.get("l_total"),
            },
        }
        print(f"  {nombre}: {tot['E_y']:.0f} kWh/kWp ±{tot.get('SD_y') or 0:.0f}, "
              f"optimo {tilt_opt}° az {az_opt}°", flush=True)

    doc = {
        "fuente": "PVGIS v5.3 — Comisión Europea, JRC",
        "baseRadiacion": "PVGIS-ERA5",
        "aniosCubiertos": "2005–2023",
        "perdidasSistema": "no incluidas (loss=0): las aplica SolarMe con LOSS",
        "generado": time.strftime("%Y-%m-%d"),
        "sitios": sitios,
    }
    with open(SALIDA, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, indent=1)
    print(f"\nescrito {SALIDA} con {len(sitios)} sitios medidos")


if __name__ == "__main__":
    main()
