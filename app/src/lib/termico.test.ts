import { describe, it, expect } from "vitest";
import {
  ajusteTermico, coefReferencia, climaDe, pesoDelClima,
  REF_PVGIS, DELTA_T_OPERACION, LIMITE,
} from "./termico";
import { SITES } from "./site";
import { CITIES, compute, type Design, type Panel } from "./solar";
import { enrichPanels } from "./price";
import panelsJson from "../data/panels.json";

const panels = enrichPanels(panelsJson.panels as unknown as Panel[]);
const coefs = panels.map((p) => p.temp);
const campeche = SITES["campeche"];
const cdmx = SITES["cdmx"];

describe("la referencia sale del modelo publicado, no de una estimación", () => {
  it("a 25 °C reproduce el coeficiente de PVGIS v5 para silicio cristalino", () => {
    // A irradiancia nominal el modelo de Huld queda 1 + k3·T' + k6·T'², así que a T'=0 el
    // coeficiente efectivo es k3. PVGIS publica −0.004702 → −0.4702 %/°C.
    expect(coefReferencia(25)).toBeCloseTo(-0.4702, 4);
    expect(REF_PVGIS.k3).toBe(-0.004702);
  });

  it("la referencia se ablanda al calentarse, por el término cuadrático", () => {
    expect(coefReferencia(50)).toBeGreaterThan(coefReferencia(25));
    expect(coefReferencia(50)).toBeCloseTo(-0.4452, 4);
  });

  it("la referencia es PEOR que un módulo moderno, así que el ajuste típico es positivo", () => {
    // El catálogo real ronda −0.25 a −0.49 %/°C: la mayoría supera a la referencia.
    const mejores = coefs.filter((c) => c > coefReferencia(45)).length;
    expect(mejores).toBeGreaterThan(coefs.length * 0.8);
  });
});

describe("el ajuste depende del sitio medido", () => {
  it("sin sitio no se supone nada: factor exactamente 1", () => {
    const a = ajusteTermico(-0.29);
    expect(a.factor).toBe(1);
    expect(Number.isNaN(a.tCelda)).toBe(true);
  });

  it("la celda es el aire medido más la sobretemperatura declarada", () => {
    const a = ajusteTermico(-0.29, campeche);
    expect(a.tCelda).toBeCloseTo(campeche.tMediaSol! + DELTA_T_OPERACION, 5);
  });

  it("un módulo peor que la referencia sale con ajuste negativo", () => {
    expect(ajusteTermico(-0.49, campeche).factor).toBeLessThan(1);
  });

  it("el mismo módulo gana más donde hace más calor", () => {
    const caliente = ajusteTermico(-0.25, campeche).factor;
    const fresco = ajusteTermico(-0.25, cdmx).factor;
    expect(caliente).toBeGreaterThan(fresco);
  });

  it("ningún módulo del catálogo en ningún sitio toca el tope", () => {
    let evaluados = 0;
    for (const clave in SITES) {
      const s = SITES[clave];
      if (s.tMediaSol === undefined) continue;
      for (const c of coefs) {
        const a = ajusteTermico(c, s);
        expect(a.recortado, `${s.nombre} con ${c}`).toBe(false);
        expect(Math.abs(a.factor - 1)).toBeLessThan(LIMITE);
        evaluados++;
      }
    }
    // la prueba tiene que demostrar que recorrió algo
    expect(evaluados).toBeGreaterThan(93 * 100);
  });

  it("un coeficiente absurdo sí se recorta en vez de propagarse", () => {
    const a = ajusteTermico(5, campeche);
    expect(a.recortado).toBe(true);
    expect(a.factor).toBeCloseTo(1 + LIMITE, 10);
  });
});

describe("cuánto vale elegir bien el módulo, por clima", () => {
  it("separa más del doble en Campeche que en la capital", () => {
    const cal = pesoDelClima(coefs, campeche);
    const fre = pesoDelClima(coefs, cdmx);
    expect(cal).toBeGreaterThan(fre * 2);
    // y son cifras de pocos puntos, no de decenas: nadie debe prometer un salto grande
    expect(cal).toBeLessThan(8);
    expect(fre).toBeGreaterThan(1);
  });

  it("sin sitio no se afirma nada sobre el peso del clima", () => {
    expect(pesoDelClima(coefs)).toBe(0);
  });
});

describe("el clima se deriva de la medición", () => {
  it("Campeche sale cálido y la capital fresca, sin que nadie lo elija", () => {
    expect(climaDe(campeche)).toEqual({ clima: "calido", medido: true });
    expect(climaDe(cdmx)).toEqual({ clima: "fresco", medido: true });
  });

  it("sin sitio se declara que no está medido", () => {
    expect(climaDe()).toEqual({ clima: "templado", medido: false });
  });

  it("los tres climas existen en el catálogo real de sitios", () => {
    const vistos = new Set<string>();
    for (const k in SITES) if (SITES[k].tMediaSol !== undefined) vistos.add(climaDe(SITES[k]).clima);
    expect(vistos).toEqual(new Set(["calido", "templado", "fresco"]));
  });
});

/**
 * Lo que faltaba: el coeficiente influía en el puntaje pero no en la energía. Estas dos pruebas
 * son las que fallan si el factor se deja de aplicar en `compute`.
 */
describe("el coeficiente entra en la producción", () => {
  const base = (panel: Panel, clave: string): Design => ({
    panel, type: "com", area: 200, tilt: CITIES[clave].site!.tiltOptimo, az: 180, shade: 0,
    lat: CITIES[clave].lat, lng: CITIES[clave].lng, yield: CITIES[clave].yield,
    site: CITIES[clave].site,
  });

  const mejor = panels.reduce((a, b) => (b.temp > a.temp ? b : a));
  const peor = panels.reduce((a, b) => (b.temp < a.temp ? b : a));

  it("dos módulos con el mismo watt y distinto coeficiente producen distinto", () => {
    // se igualan los watts para aislar el efecto térmico del tamaño
    const a = compute(base({ ...mejor, w: 500, area: 2.3 }, "campeche"));
    const b = compute(base({ ...peor, w: 500, area: 2.3 }, "campeche"));
    expect(a.n).toBe(b.n);
    expect(a.kwh).toBeGreaterThan(b.kwh);
    const dif = (a.kwh / b.kwh - 1) * 100;
    expect(dif).toBeGreaterThan(1.5);
    expect(dif).toBeLessThan(8);
  });

  it("la misma diferencia es menor en un sitio fresco", () => {
    const rel = (clave: string) => {
      const a = compute(base({ ...mejor, w: 500, area: 2.3 }, clave));
      const b = compute(base({ ...peor, w: 500, area: 2.3 }, clave));
      return a.kwh / b.kwh - 1;
    };
    expect(rel("campeche")).toBeGreaterThan(rel("cdmx") * 1.8);
  });

  it("compute expone el ajuste para que la interfaz lo pueda declarar", () => {
    const r = compute(base(mejor, "campeche"));
    expect(r.termico.factor).toBeGreaterThan(1);
    expect(r.termico.coefRef).toBeLessThan(0);
    expect(r.termico.tCelda).toBeGreaterThan(40);
  });
});
