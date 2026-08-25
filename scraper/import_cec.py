#!/usr/bin/env python3
"""
SolarMe · Importador de paneles desde la base pública CEC (NREL SAM).

Fuente: https://github.com/NREL/SAM  (deploy/libraries/CEC Modules.csv)
Base pública de módulos fotovoltaicos certificados por la California Energy Commission.

QUÉ CAMBIÓ Y POR QUÉ
--------------------
La versión anterior hacía esto:

    panels.sort(key=lambda p: (-p["w"], -p["eff"]))
    panels = panels[:MAX_KEEP]

Es decir: se quedaba con los 140 módulos MÁS POTENTES de toda la base. El resultado era un
catálogo entero entre 710 y 740 W —módulos de escala comercial/utility— sin Jinko, sin LONGi
y sin JA Solar, que son justo las marcas que se venden en México. Un recomendador puede estar
perfectamente calibrado y seguir siendo inútil si el conjunto de candidatos no contiene lo que
el instalador puede comprar.

Ahora la selección es ESTRATIFICADA por clase de potencia, con las clases que de verdad se
instalan, y con un tope por marca para que ninguna domine el catálogo (G-Star llegaba a 28 de
140, el 20 %).

También se eliminó el precio inventado. La función anterior era:

    if eff >= 22.5: return 0.34
    if eff >= 21.0: return 0.28

un proxy de eficiencia disfrazado de precio, sin moneda declarada, que producía solo dos
valores distintos para 140 módulos. El precio ahora vive en la app (src/lib/price.ts) como
banda de mercado en MXN/Wp, con procedencia explícita. Ver research/03-precios-mexico-perplexity.md.

Uso:  python3 scraper/import_cec.py
"""
import csv, io, json, os, sys, urllib.request
from collections import defaultdict

CEC_URL = "https://raw.githubusercontent.com/NREL/SAM/develop/deploy/libraries/CEC%20Modules.csv"
OUT = os.path.join(os.path.dirname(__file__), "..", "app", "src", "data", "panels.json")

# Clases de potencia que se instalan realmente, con cuántos módulos guardar de cada una.
# La banda residencial (400-620 W) es la que más peso lleva porque es el grueso del mercado
# mexicano de generación distribuida; el catálogo anterior no tenía NI UNO en ese rango.
CLASSES = [
    ("residencial",            400, 500,  30),
    ("residencial alta",       500, 620,  45),
    ("comercial",              620, 700,  35),
    ("comercial gran formato", 700, 900,  30),
]
MAX_PER_BRAND = 12  # tope GLOBAL, no por clase: si se aplica por clase una marca puede
                    # acumular 4 veces el tope y volver a dominar el catálogo.

# Marcas con presencia comprobada en el mercado mexicano (ver la investigación). Se usan para
# ordenar DENTRO de cada clase, no para excluir: un módulo bueno de una marca no listada sigue
# entrando si queda espacio.
MX_BRANDS = (
    "jinko", "longi", "trina", "ja solar", "jasolar", "canadian", "csi solar",
    "chint", "astronergy", "risen", "q cells", "qcells", "hanwha", "first solar",
    "phono", "znshine", "suntech", "gcl", "seg solar", "talesun", "jolywood",
    "boviet", "rec ", "sunpower", "maxeon", "elite solar",
)


def fnum(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def clean_model(name, manuf):
    m = (name or "").strip()
    if manuf and m.lower().startswith(manuf.lower()):
        m = m[len(manuf):].strip(" -_")
    return m or name


def in_mexico(brand):
    b = (brand or "").lower()
    return any(k in b for k in MX_BRANDS)


def load_rows(text):
    reader = csv.DictReader(io.StringIO(text))
    for row in reader:
        stc = fnum(row.get("STC"))
        ac = fnum(row.get("A_c"))
        # las filas de metadatos de SAM no tienen STC numérico -> se descartan
        if stc is None or ac is None or ac <= 0:
            continue
        yield row, stc, ac


def select(pool, keep, per_brand):
    """Elige `keep` módulos de una clase repartidos por TODO el rango de eficiencia.

    Ordenar por eficiencia descendente y cortar los primeros parece razonable y no lo es:
    deja el catálogo entero en 23–24 %, cuando lo que se instala en México está en 20–22 %.
    Eso además anula la varianza del eje de eficiencia, que en el modo "espacio" del
    recomendador pesa 0.5 — el mismo error de fondo que tenía el precio.

    Se recorre la lista ordenada por eficiencia ascendente con paso constante, de modo que
    entren módulos de gama baja, media y alta. `per_brand` es el contador GLOBAL compartido
    entre clases: si una marca ya llegó a su tope, se toma el vecino inmediato.
    """
    pool.sort(key=lambda p: (p["eff"], p["w"]))
    if not pool:
        return []
    out, used = [], set()
    step = max(len(pool) / keep, 1.0)
    for i in range(keep):
        idx = min(int(i * step), len(pool) - 1)
        # Desde la posición ideal, avanzo hasta encontrar uno admisible.
        for j in list(range(idx, len(pool))) + list(range(idx - 1, -1, -1)):
            p = pool[j]
            if j in used or per_brand[p["brand"]] >= MAX_PER_BRAND:
                continue
            used.add(j)
            per_brand[p["brand"]] += 1
            out.append(p)
            break
    return out


def main():
    print(f"Descargando base CEC…\n  {CEC_URL}")
    try:
        with urllib.request.urlopen(CEC_URL, timeout=60) as r:
            text = r.read().decode("utf-8", "replace")
    except Exception as e:
        print(f"ERROR al descargar: {e}", file=sys.stderr)
        sys.exit(1)

    seen, buckets, total = set(), defaultdict(list), 0
    for row, stc, ac in load_rows(text):
        total += 1
        eff = stc / (ac * 1000.0) * 100.0
        if not (14.0 <= eff <= 24.5):
            continue
        manuf = (row.get("Manufacturer") or "").strip()
        model = clean_model(row.get("Name"), manuf)
        key = (manuf.lower(), model.lower())
        if key in seen:
            continue

        cls = next((c for c in CLASSES if c[1] <= stc < c[2]), None)
        if cls is None:
            continue
        seen.add(key)

        gamma = fnum(row.get("gamma_pmp"))
        buckets[cls[0]].append({
            "brand": manuf or "N/D",
            "model": model,
            "w": round(stc),
            "eff": round(eff, 1),
            "temp": round(gamma, 2) if gamma is not None else -0.30,
            "area": round(ac, 2),
            # Datos ELECTRICOS. Sin ellos la app puede decir que caben doce modulos pero no
            # como conectarlos, y un string que rebasa el voltaje maximo del inversor en una
            # manana fria destruye equipo: `beta_oc` es negativo, asi que el frio SUBE el
            # voltaje de circuito abierto. Es el calculo que la norma exige y que no se puede
            # hacer sin estos campos.
            "voc": round(fnum(row.get("V_oc_ref")) or 0, 2),
            "vmp": round(fnum(row.get("V_mp_ref")) or 0, 2),
            "isc": round(fnum(row.get("I_sc_ref")) or 0, 2),
            "imp": round(fnum(row.get("I_mp_ref")) or 0, 2),
            # Coeficiente de temperatura de Voc en V/C, tal como lo publica CEC.
            "betaVoc": round(fnum(row.get("beta_oc")) or 0, 4),
            # N_s NO se guarda: en esta base no es el conteo fisico de celdas. Un Jinko de
            # 405 W reporta 18 con 38.1 V, que serian 2.1 V por celda, imposible en silicio;
            # para modulos de media celda y para el CdTe de First Solar significa otra cosa. No
            # se envia un campo que no se puede interpretar. La coherencia se valida contra la
            # potencia: vmp x imp reproduce la placa dentro del 3 % en 139 de 140.
            "tech": (row.get("Technology") or "").strip(),
            "bifacial": (row.get("Bifacial") or "0").strip() in ("1", "1.0"),
            "class": cls[0],
            # CEC no publica garantía. Antes se escribía 25 fijo para todos, lo que dejaba ese
            # término sin varianza y por tanto sin efecto en el puntaje. Ahora se declara
            # desconocido y la app lo trata como tal.
            "warr": None,
            "source": "CEC (NREL SAM)",
        })

    panels = []
    per_brand = defaultdict(int)   # contador GLOBAL, compartido entre clases
    print("\nSelección por clase de potencia:")
    for name, lo, hi, keep in CLASSES:
        # Se prefieren marcas con presencia en México; si no alcanzan, se completa con el resto.
        mx_pool = [p for p in buckets[name] if in_mexico(p["brand"])]
        chosen = select(mx_pool, keep, per_brand)
        if len(chosen) < keep:
            resto = [p for p in buckets[name] if not in_mexico(p["brand"])]
            chosen += select(resto, keep - len(chosen), per_brand)
        effs = sorted(p["eff"] for p in chosen) or [0]
        print(f"  {name:<24} {lo}-{hi}W  candidatos {len(buckets[name]):>4}  "
              f"elegidos {len(chosen):>3}  eficiencia {effs[0]}-{effs[-1]}%")
        panels.extend(chosen)

    panels.sort(key=lambda p: (p["w"], -p["eff"]))

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump({
            "source": "California Energy Commission via NREL SAM",
            "source_url": CEC_URL,
            "count": len(panels),
            "selection": "estratificada por clase de potencia, tope de "
                         f"{MAX_PER_BRAND} por marca, prioridad a marcas con presencia en México",
            "note": "CEC no publica precio ni garantía. El precio vive en src/lib/price.ts como "
                    "banda de mercado en MXN/Wp con procedencia declarada; warr es null porque "
                    "la base no lo trae.",
            "panels": panels,
        }, f, ensure_ascii=False, indent=2)

    brands = {p["brand"] for p in panels}
    ws = sorted(p["w"] for p in panels)
    print(f"\nFilas de datos leídas: {total}")
    print(f"Paneles guardados:     {len(panels)}  ->  {os.path.abspath(OUT)}")
    print(f"Marcas distintas:      {len(brands)}")
    print(f"Rango de potencia:     {ws[0]}-{ws[-1]} W")


if __name__ == "__main__":
    main()
