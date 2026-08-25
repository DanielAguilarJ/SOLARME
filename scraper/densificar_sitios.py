#!/usr/bin/env python3
"""Segunda capa de sitios medidos: cobertura densa con una llamada por ciudad.

Las 41 ciudades de la primera capa traen la malla completa de azimut e inclinacion, 22
llamadas cada una. Esa malla resulto innecesaria por sitio: la FORMA normalizada de la
perdida por azimut es la misma en las 41 (0.031-0.038 a 15 grados, 0.263-0.288 a 45) y solo
la escala depende de la inclinacion, ya ajustada como 0.019 x tilt^2.

Asi que lo unico genuinamente propio de cada punto es el rendimiento, el angulo optimo, la
forma mensual, la altitud y la variacion interanual: todo eso cabe en UNA llamada con
optimalangles=1. Con tres llamadas por ciudad (esa, la irradiacion horizontal y NASA para
contrastar) se agregan cincuenta ciudades por el costo de siete de la primera capa.

Estos sitios se marcan mallaCompleta=false y el modelo usa para ellos la formula ajustada,
declarandolo. Medir el rendimiento donde esta el cliente vale mas que medir la malla en
pocas ciudades.
"""
import json
import sys
import time
import urllib.request

RUTA = "app/src/data/sites.json"
API = "https://re.jrc.ec.europa.eu/api/v5_3/PVcalc"
UMBRAL = 3.0

# Elegidas para cerrar las brechas que midio el analisis de proximidad: el peor caso era
# Piedras Negras a 336 km del sitio mas cercano, y la mediana 105 km.
CIUDADES = [
    ("piedras negras", "Piedras Negras", 28.7000, -100.5236, "Coahuila"),
    ("nuevo laredo", "Nuevo Laredo", 27.4763, -99.5164, "Tamaulipas"),
    ("monclova", "Monclova", 26.9107, -101.4220, "Coahuila"),
    ("matamoros", "Matamoros", 25.8697, -97.5027, "Tamaulipas"),
    ("nogales", "Nogales", 31.3186, -110.9421, "Sonora"),
    ("ciudad obregon", "Ciudad Obregón", 27.4864, -109.9408, "Sonora"),
    ("navojoa", "Navojoa", 27.0728, -109.4436, "Sonora"),
    ("guaymas", "Guaymas", 27.9200, -110.8983, "Sonora"),
    ("los mochis", "Los Mochis", 25.7935, -108.9860, "Sinaloa"),
    ("guasave", "Guasave", 25.5667, -108.4667, "Sinaloa"),
    ("mazatlan", "Mazatlán", 23.2494, -106.4111, "Sinaloa"),
    ("ensenada", "Ensenada", 31.8667, -116.5964, "Baja California"),
    ("san jose del cabo", "San José del Cabo", 23.0631, -109.6975, "Baja California Sur"),
    ("ciudad cuauhtemoc", "Cuauhtémoc", 28.4050, -106.8667, "Chihuahua"),
    ("delicias", "Delicias", 28.1900, -105.4700, "Chihuahua"),
    ("parral", "Hidalgo del Parral", 26.9333, -105.6667, "Chihuahua"),
    ("gomez palacio", "Gómez Palacio", 25.5611, -103.4986, "Durango"),
    ("fresnillo", "Fresnillo", 23.1750, -102.8667, "Zacatecas"),
    ("matehuala", "Matehuala", 23.6528, -100.6417, "San Luis Potosí"),
    ("rio verde", "Río Verde", 21.9333, -99.9972, "San Luis Potosí"),
    ("irapuato", "Irapuato", 20.6767, -101.3563, "Guanajuato"),
    ("celaya", "Celaya", 20.5230, -100.8155, "Guanajuato"),
    ("salamanca", "Salamanca", 20.5700, -101.1950, "Guanajuato"),
    ("san miguel de allende", "San Miguel de Allende", 20.9142, -100.7436, "Guanajuato"),
    ("tepatitlan", "Tepatitlán", 20.8167, -102.7333, "Jalisco"),
    ("puerto vallarta", "Puerto Vallarta", 20.6534, -105.2253, "Jalisco"),
    ("ciudad guzman", "Ciudad Guzmán", 19.7000, -103.4667, "Jalisco"),
    ("manzanillo", "Manzanillo", 19.0522, -104.3158, "Colima"),
    ("uruapan", "Uruapan", 19.4110, -102.0560, "Michoacán"),
    ("zamora", "Zamora", 19.9856, -102.2836, "Michoacán"),
    ("lazaro cardenas", "Lázaro Cárdenas", 17.9583, -102.2000, "Michoacán"),
    ("zitacuaro", "Zitácuaro", 19.4333, -100.3572, "Michoacán"),
    ("cuautla", "Cuautla", 18.8125, -98.9539, "Morelos"),
    ("iguala", "Iguala", 18.3447, -99.5386, "Guerrero"),
    ("zihuatanejo", "Zihuatanejo", 17.6392, -101.5514, "Guerrero"),
    ("tula", "Tula de Allende", 20.0533, -99.3428, "Hidalgo"),
    ("tulancingo", "Tulancingo", 20.0833, -98.3667, "Hidalgo"),
    ("apizaco", "Apizaco", 19.4139, -98.1400, "Tlaxcala"),
    ("tehuacan", "Tehuacán", 18.4617, -97.3928, "Puebla"),
    ("orizaba", "Orizaba", 18.8514, -97.1000, "Veracruz"),
    ("cordoba", "Córdoba", 18.8833, -96.9333, "Veracruz"),
    ("poza rica", "Poza Rica", 20.5333, -97.4500, "Veracruz"),
    ("coatzacoalcos", "Coatzacoalcos", 18.1345, -94.4650, "Veracruz"),
    ("puerto escondido", "Puerto Escondido", 15.8600, -97.0700, "Oaxaca"),
    ("salina cruz", "Salina Cruz", 16.1667, -95.2000, "Oaxaca"),
    ("tapachula", "Tapachula", 14.9030, -92.2620, "Chiapas"),
    ("comitan", "Comitán", 16.2500, -92.1333, "Chiapas"),
    ("palenque", "Palenque", 17.5094, -91.9819, "Chiapas"),
    ("ciudad del carmen", "Ciudad del Carmen", 18.6333, -91.8333, "Campeche"),
    ("playa del carmen", "Playa del Carmen", 20.6274, -87.0799, "Quintana Roo"),
    ("cozumel", "Cozumel", 20.4230, -86.9223, "Quintana Roo"),
    ("valladolid", "Valladolid", 20.6896, -88.2011, "Yucatán"),
]


def pide(url):
    for intento in range(4):
        try:
            with urllib.request.urlopen(url, timeout=90) as r:
                return json.load(r)
        except Exception:
            if intento == 3:
                raise
            time.sleep(4)


def medir(nombre, lat, lon, estado):
    d = pide(f"{API}?lat={lat}&lon={lon}&peakpower=1&loss=0&optimalangles=1&outputformat=json")
    ent, sal = d["inputs"], d["outputs"]
    fijo = ent["mounting_system"]["fixed"]
    tilt = round(fijo["slope"]["value"])
    tot = sal["totals"]["fixed"]
    mensual = [round(m["E_m"], 1) for m in sal["monthly"]["fixed"]]
    total_m = sum(mensual)
    time.sleep(0.5)

    # rendimiento al SUR con la inclinacion optima: es el anclaje que usa el modelo
    sur = pide(f"{API}?lat={lat}&lon={lon}&peakpower=1&loss=0&angle={tilt}"
               "&aspect=0&outputformat=json")["outputs"]["totals"]["fixed"]["E_y"]
    time.sleep(0.5)
    gp = pide(f"{API}?lat={lat}&lon={lon}&peakpower=1&loss=0&angle=0"
              "&aspect=0&outputformat=json")["outputs"]["totals"]["fixed"]["H(i)_y"]
    time.sleep(0.5)
    gn = pide("https://power.larc.nasa.gov/api/temporal/climatology/point"
              "?parameters=ALLSKY_SFC_SW_DWN&community=RE"
              f"&longitude={lon}&latitude={lat}&format=JSON"
              )["properties"]["parameter"]["ALLSKY_SFC_SW_DWN"]["ANN"] * 365

    disc = (gp - gn) / gn * 100
    factor = min(1.0, gn / gp)
    deg = disc > UMBRAL and factor < 1.0

    return {
        "nombre": nombre, "estado": estado, "lat": lat, "lng": lon,
        "elevacion": ent["location"]["elevation"],
        "rendimiento": round(tot["E_y"], 1),
        "rendimientoSur": round(sur, 1),
        "rendimientoUsado": round(sur * (factor if deg else 1.0), 1),
        "desviacionInteranual": round(tot.get("SD_y") or 0, 1),
        "tiltOptimo": tilt,
        "azimutOptimo": round(fijo["azimuth"]["value"]),
        "ganaSobreSur": round((tot["E_y"] - sur) / sur * 100, 2),
        "mensual": [round(x / total_m, 5) for x in mensual],
        "mensualKwh": mensual,
        "ghiPvgis": round(gp, 1), "ghiNasa": round(gn, 1),
        "discrepanciaFuentes": round(disc, 2),
        "factorConservador": round(factor, 4),
        "fuenteRendimiento": "menor-de-dos" if deg else "concuerdan",
        # sin malla propia: el modelo usa la formula ajustada a las 41 mallas y lo declara
        "mallaCompleta": False,
    }


def main():
    doc = json.load(open(RUTA, encoding="utf-8"))
    for clave in doc["sitios"]:
        doc["sitios"][clave].setdefault("mallaCompleta", True)

    pend = [c for c in CIUDADES if c[0] not in doc["sitios"]]
    print(f"por medir: {len(pend)}", flush=True)
    for i, (clave, nombre, lat, lon, estado) in enumerate(pend, 1):
        try:
            doc["sitios"][clave] = medir(nombre, lat, lon, estado)
            s = doc["sitios"][clave]
            print(f"[{i}/{len(pend)}] {nombre:<22}{s['rendimientoUsado']:>7.0f}  "
                  f"opt {s['tiltOptimo']:>2}°  {s['elevacion']:>5.0f} m  "
                  f"{s['fuenteRendimiento']}", flush=True)
        except Exception as e:
            print(f"[{i}/{len(pend)}] {nombre}: FALLO {e}", flush=True)
            continue
        with open(RUTA, "w", encoding="utf-8") as f:
            json.dump(doc, f, ensure_ascii=False, indent=1)

    print(f"\ntotal: {len(doc['sitios'])} sitios", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
