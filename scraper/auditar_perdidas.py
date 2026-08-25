#!/usr/bin/env python3
"""Audita las curvas de perdida de SolarMe contra PVGIS midiendo barridos reales.

No pregunta a nadie cual es la inclinacion optima: la mide. Recorre inclinaciones y
azimuts en dos ciudades de latitud muy distinta, encuentra el maximo real y compara la
perdida medida contra la que predicen tiltLoss() y azimuthLoss().
"""
import json
import time
import urllib.request

API = "https://re.jrc.ec.europa.eu/api/v5_3/PVcalc"
CIUDADES = [("CDMX", 19.4326, -99.1332), ("Tijuana", 32.5149, -117.0382),
            ("Merida", 20.9674, -89.5926)]

TILTS = [0, 5, 10, 15, 20, 22, 25, 28, 30, 35, 40]
AZIMUTS = [-90, -60, -45, -30, -15, 0, 15, 30, 45, 60, 90]


def ey(lat, lon, tilt, aspect):
    url = (f"{API}?lat={lat}&lon={lon}&peakpower=1&loss=0"
           f"&angle={tilt}&aspect={aspect}&outputformat=json")
    for intento in range(3):
        try:
            with urllib.request.urlopen(url, timeout=90) as r:
                return json.load(r)["outputs"]["totals"]["fixed"]["E_y"]
        except Exception:
            if intento == 2:
                raise
            time.sleep(3)


def tilt_loss_solarme(tilt, opt):
    d = abs(tilt - opt)
    return min(0.35, 0.00011 * d * d + 0.0004 * d)


def az_loss_solarme(aspect):
    d = abs(aspect)
    return min(0.30, 0.000035 * d * d + 0.00012 * d)


def main():
    for nombre, lat, lon in CIUDADES:
        print(f"\n{'=' * 66}\n{nombre}  lat {lat}   (formula propia: {round(min(35, max(10, lat * 0.87)))}°)\n{'=' * 66}")

        medidos = {}
        for t in TILTS:
            medidos[t] = ey(lat, lon, t, 0)
            time.sleep(0.8)

        mejor = max(medidos, key=medidos.get)
        pico = medidos[mejor]
        formula = round(min(35, max(10, lat * 0.87)))

        print(f"{'tilt':>5}{'E_y':>9}{'perdida real':>14}{'predicha':>11}{'error':>8}")
        for t in TILTS:
            real = (pico - medidos[t]) / pico
            pred = tilt_loss_solarme(t, mejor)
            print(f"{t:>5}{medidos[t]:>9.0f}{real * 100:>13.2f}%{pred * 100:>10.2f}%"
                  f"{(pred - real) * 100:>+7.2f}")
        print(f"  -> optimo MEDIDO {mejor}°   formula propia {formula}°   "
              f"costo de usar la formula: {(pico - medidos.get(formula, pico)) / pico * 100:.2f}%"
              if formula in medidos else f"  -> optimo MEDIDO {mejor}°")

        # azimut al optimo medido
        print(f"\n  azimut (0 = sur) al tilt {mejor}°")
        az = {}
        for a in AZIMUTS:
            az[a] = ey(lat, lon, mejor, a)
            time.sleep(0.8)
        picoaz = max(az.values())
        print(f"{'aspect':>7}{'E_y':>9}{'perdida real':>14}{'predicha':>11}{'error':>8}")
        for a in AZIMUTS:
            real = (picoaz - az[a]) / picoaz
            pred = az_loss_solarme(a)
            print(f"{a:>7}{az[a]:>9.0f}{real * 100:>13.2f}%{pred * 100:>10.2f}%"
                  f"{(pred - real) * 100:>+7.2f}")


if __name__ == "__main__":
    main()
