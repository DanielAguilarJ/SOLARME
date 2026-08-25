#!/usr/bin/env python3
"""Amplia sites.json a cobertura nacional: una ciudad por estado mas los mercados grandes.

Con siete ciudades medidas, cualquier direccion fuera de ellas caia al promedio nacional
con hasta 7 % de error. Mexico instala solar en mucho mas de siete ciudades, y las de
mayor irradiancia del pais (Sonora, las dos Baja California, Chihuahua) no estaban.

Mismo metodo que el lote original: PVGIS v5.3 con loss=0, angulo optimo medido, malla de
azimut e inclinacion, y contraste contra NASA POWER para degradar donde discrepen.
"""
import json
import sys
import time
import urllib.request

RUTA = "app/src/data/sites.json"
API = "https://re.jrc.ec.europa.eu/api/v5_3/PVcalc"
UMBRAL = 3.0

AZIMUTS = [-90, -75, -60, -45, -30, -15, 0, 15, 30, 45, 60, 75, 90]
DESVIOS = [-20, -15, -10, -5, 0, 5, 10, 15, 20, 30]

# clave, nombre, lat, lng, estado. Capital de cada estado que faltaba, mas los mercados
# solares que no son capital pero pesan: Mexicali y Ciudad Juarez por irradiancia y carga
# de clima artificial, Leon y Torreon por volumen industrial.
NUEVAS = [
    ("mexicali", "Mexicali", 32.6245, -115.4523, "Baja California"),
    ("hermosillo", "Hermosillo", 29.0729, -110.9559, "Sonora"),
    ("chihuahua", "Chihuahua", 28.6330, -106.0691, "Chihuahua"),
    ("ciudad juarez", "Ciudad Juárez", 31.6904, -106.4245, "Chihuahua"),
    ("la paz", "La Paz", 24.1426, -110.3128, "Baja California Sur"),
    ("culiacan", "Culiacán", 24.8091, -107.3940, "Sinaloa"),
    ("saltillo", "Saltillo", 25.4232, -101.0053, "Coahuila"),
    ("torreon", "Torreón", 25.5428, -103.4068, "Coahuila"),
    ("durango", "Durango", 24.0277, -104.6532, "Durango"),
    ("zacatecas", "Zacatecas", 22.7709, -102.5832, "Zacatecas"),
    ("san luis potosi", "San Luis Potosí", 22.1565, -100.9855, "San Luis Potosí"),
    ("aguascalientes", "Aguascalientes", 21.8853, -102.2916, "Aguascalientes"),
    ("leon", "León", 21.1250, -101.6860, "Guanajuato"),
    ("guanajuato", "Guanajuato", 21.0190, -101.2574, "Guanajuato"),
    ("queretaro", "Querétaro", 20.5888, -100.3899, "Querétaro"),
    ("tepic", "Tepic", 21.5041, -104.8455, "Nayarit"),
    ("colima", "Colima", 19.2433, -103.7247, "Colima"),
    ("morelia", "Morelia", 19.7008, -101.1844, "Michoacán"),
    ("toluca", "Toluca", 19.2826, -99.6557, "Estado de México"),
    ("pachuca", "Pachuca", 20.1011, -98.7591, "Hidalgo"),
    ("tlaxcala", "Tlaxcala", 19.3139, -98.2404, "Tlaxcala"),
    ("cuernavaca", "Cuernavaca", 18.9186, -99.2342, "Morelos"),
    ("chilpancingo", "Chilpancingo", 17.5506, -99.5024, "Guerrero"),
    ("acapulco", "Acapulco", 16.8531, -99.8237, "Guerrero"),
    ("oaxaca", "Oaxaca", 17.0732, -96.7266, "Oaxaca"),
    ("tuxtla gutierrez", "Tuxtla Gutiérrez", 16.7516, -93.1029, "Chiapas"),
    ("villahermosa", "Villahermosa", 17.9895, -92.9475, "Tabasco"),
    ("campeche", "Campeche", 19.8301, -90.5349, "Campeche"),
    ("chetumal", "Chetumal", 18.5002, -88.2961, "Quintana Roo"),
    ("veracruz", "Veracruz", 19.1738, -96.1342, "Veracruz"),
    ("xalapa", "Xalapa", 19.5438, -96.9102, "Veracruz"),
    ("tampico", "Tampico", 22.2553, -97.8686, "Tamaulipas"),
    ("ciudad victoria", "Ciudad Victoria", 23.7369, -99.1411, "Tamaulipas"),
    ("reynosa", "Reynosa", 26.0806, -98.2880, "Tamaulipas"),
]


def pide(url):
    for intento in range(5):
        try:
            with urllib.request.urlopen(url, timeout=90) as r:
                return json.load(r)
        except Exception as e:
            if intento == 4:
                raise
            print(f"    reintento {intento + 1} ({e})", flush=True)
            time.sleep(5)


def pvcalc(lat, lon, **extra):
    q = "".join(f"&{k}={v}" for k, v in extra.items())
    return pide(f"{API}?lat={lat}&lon={lon}&peakpower=1&loss=0&outputformat=json{q}")


def ghi_nasa(lat, lon):
    d = pide("https://power.larc.nasa.gov/api/temporal/climatology/point"
             "?parameters=ALLSKY_SFC_SW_DWN&community=RE"
             f"&longitude={lon}&latitude={lat}&format=JSON")
    return d["properties"]["parameter"]["ALLSKY_SFC_SW_DWN"]["ANN"] * 365


def medir(nombre, lat, lon, estado):
    base = pvcalc(lat, lon, optimalangles=1)
    ent, sal = base["inputs"], base["outputs"]
    fijo = ent["mounting_system"]["fixed"]
    tilt = round(fijo["slope"]["value"])
    tot = sal["totals"]["fixed"]
    mensual = [round(m["E_m"], 1) for m in sal["monthly"]["fixed"]]
    total_m = sum(mensual)
    time.sleep(0.5)

    az_e = {}
    for a in AZIMUTS:
        az_e[a] = pvcalc(lat, lon, angle=tilt, aspect=a)["outputs"]["totals"]["fixed"]["E_y"]
        time.sleep(0.45)
    sur = az_e[0]
    perdida_az = {str(a): round((sur - v) / sur * 100, 2) for a, v in az_e.items()}

    t_e = {}
    for dv in DESVIOS:
        t = tilt + dv
        if t < 0 or t > 60:
            continue
        t_e[dv] = pvcalc(lat, lon, angle=t, aspect=0)["outputs"]["totals"]["fixed"]["E_y"]
        time.sleep(0.45)
    pico_t = max(t_e.values())
    perdida_tilt = {str(k): round((pico_t - v) / pico_t * 100, 2) for k, v in t_e.items()}

    gp = pvcalc(lat, lon, angle=0, aspect=0)["outputs"]["totals"]["fixed"]["H(i)_y"]
    time.sleep(0.5)
    gn = ghi_nasa(lat, lon)

    discrepancia = (gp - gn) / gn * 100
    factor = min(1.0, gn / gp)
    degradado = abs(discrepancia) > UMBRAL and factor < 1.0

    return {
        "nombre": nombre,
        "estado": estado,
        "lat": lat,
        "lng": lon,
        "elevacion": ent["location"]["elevation"],
        "rendimiento": round(tot["E_y"], 1),
        "rendimientoSur": round(sur, 1),
        "rendimientoUsado": round(sur * (factor if degradado else 1.0), 1),
        "desviacionInteranual": round(tot.get("SD_y") or 0, 1),
        "tiltOptimo": tilt,
        "azimutOptimo": round(fijo["azimuth"]["value"]),
        "ganaSobreSur": round(-min(perdida_az.values()), 2),
        "mensual": [round(x / total_m, 5) for x in mensual],
        "mensualKwh": mensual,
        "perdidaAzimut": perdida_az,
        "perdidaTilt": perdida_tilt,
        "ghiPvgis": round(gp, 1),
        "ghiNasa": round(gn, 1),
        "discrepanciaFuentes": round(discrepancia, 2),
        "factorConservador": round(factor, 4),
        "fuenteRendimiento": "menor-de-dos" if degradado else "concuerdan",
        "perdidas": {
            "anguloIncidencia": tot.get("l_aoi"),
            "temperaturaIrradiancia": tot.get("l_tg"),
            "total": tot.get("l_total"),
        },
    }


def main():
    doc = json.load(open(RUTA, encoding="utf-8"))
    pendientes = [c for c in NUEVAS if c[0] not in doc["sitios"]]
    print(f"por medir: {len(pendientes)} de {len(NUEVAS)}", flush=True)

    for i, (clave, nombre, lat, lon, estado) in enumerate(pendientes, 1):
        try:
            doc["sitios"][clave] = medir(nombre, lat, lon, estado)
            s = doc["sitios"][clave]
            print(f"[{i}/{len(pendientes)}] {nombre:<20} {s['rendimientoUsado']:>7.0f} kWh/kWp  "
                  f"opt {s['tiltOptimo']:>2}° az {s['azimutOptimo']:>4}°  "
                  f"{s['fuenteRendimiento']}", flush=True)
        except Exception as e:
            print(f"[{i}/{len(pendientes)}] {nombre}: FALLO {e}", flush=True)
            continue
        # se guarda tras cada ciudad: una interrupcion no pierde lo ya medido
        with open(RUTA, "w", encoding="utf-8") as f:
            json.dump(doc, f, ensure_ascii=False, indent=1)

    print(f"\ntotal de sitios medidos: {len(doc['sitios'])}", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
