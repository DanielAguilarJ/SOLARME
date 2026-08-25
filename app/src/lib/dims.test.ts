import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { panelDimensions, panelFit, type Roof } from "./dims";
import { panelCount, orientationFactor, LOSS, type Panel } from "./solar";
import { enrichPanels } from "./price";

const CEC: Panel[] = enrichPanels(
  JSON.parse(readFileSync(new URL("../data/panels.json", import.meta.url), "utf8")).panels
) as Panel[];

const PHYS = { panelCount, orientationFactor, loss: LOSS };
/** 60 m² en Monterrey, inclinación óptima, al sur. */
const TECHO: Roof = { area: 60, lat: 25.6866, tilt: 22, az: 180, shade: 0, yield: 1710 };

/**
 * El defecto que estas pruebas impiden repetir: solar.ts usaba PANEL_LENGTH = 2.28 y
 * PANEL_WIDTH = 1.13 para los 140 módulos del catálogo. A un módulo de 420 W (1.76 m real) se
 * le calculaba el pasillo de uno de 2.28 m. Y `panelCount` sí usaba el área real, así que las
 * dos estimaciones que `compute` compara eran inconsistentes.
 */

describe("dimensiones inferidas del área", () => {
  it("reproduce el formato G12 de un módulo de gran potencia", () => {
    // Trina TSM-740NEG21C20: placa 2.384 × 1.303 m = 3.106 m².
    const d = panelDimensions(3.11);
    expect(d.width).toBeCloseTo(1.303, 3);
    expect(d.length).toBeCloseTo(2.386, 2);
  });

  it("reproduce el formato de 182 mm de un módulo residencial", () => {
    // Canadian CS6W-520MB: placa 2.266 × 1.134 m = 2.570 m².
    const d = panelDimensions(2.57);
    expect(d.width).toBeCloseTo(1.134, 3);
    expect(d.length).toBeCloseTo(2.266, 2);
  });

  it("el área siempre se conserva: largo × ancho reconstruye el dato de la CEC", () => {
    for (const p of CEC) {
      const d = panelDimensions(p.area);
      if (!d.exact) continue;
      expect(d.length * d.width).toBeCloseTo(p.area, 2);
    }
  });

  it("ningún módulo del catálogo real necesita que se acote su largo", () => {
    expect(CEC.every((p) => panelDimensions(p.area).exact)).toBe(true);
  });

  it("los largos caen en el rango de un módulo comercial", () => {
    const largos = CEC.map((p) => panelDimensions(p.area).length);
    expect(Math.min(...largos)).toBeGreaterThan(1.5);
    expect(Math.max(...largos)).toBeLessThan(2.6);
  });

  it("un área absurda se acota en lugar de producir una geometría imposible", () => {
    expect(panelDimensions(0).length).toBeGreaterThan(0);
    expect(panelDimensions(-5).length).toBeGreaterThan(0);
    expect(panelDimensions(100).exact).toBe(false);
    expect(panelDimensions(100).length).toBeLessThanOrEqual(2.6);
  });
});

describe("el pasillo depende del módulo, no de una constante", () => {
  it("un módulo más largo exige más pasillo", () => {
    const corto = panelFit({ w: 400, area: 2.0, ppw: 5 }, TECHO, PHYS);
    const largo = panelFit({ w: 700, area: 2.9, ppw: 5 }, TECHO, PHYS);
    expect(largo.gap).toBeGreaterThan(corto.gap);
  });

  it("dos módulos de la misma área dan la misma geometría aunque cambien los watts", () => {
    const a = panelFit({ w: 500, area: 2.5, ppw: 5 }, TECHO, PHYS);
    const b = panelFit({ w: 600, area: 2.5, ppw: 5 }, TECHO, PHYS);
    expect(b.gap).toBe(a.gap);
    expect(b.count).toBe(a.count);
    // Misma cantidad, más watts: más energía. Ahí sí la potencia manda.
    expect(b.kwh).toBeGreaterThan(a.kwh);
  });
});

describe("qué entrega cada módulo en un techo concreto", () => {
  it("más grande NO es siempre mejor: el chico puede rendir más en un techo dado", () => {
    // Este es el sesgo que se corrigió. Medido sobre 60 m² en Monterrey, el de 400 W entrega
    // más que el de 540 W porque caben 18 contra 12.
    const chico = panelFit({ w: 400, area: 2.14, ppw: 5 }, TECHO, PHYS);
    const mediano = panelFit({ w: 540, area: 2.58, ppw: 5 }, TECHO, PHYS);
    expect(chico.count).toBeGreaterThan(mediano.count);
    expect(chico.kwh).toBeGreaterThan(mediano.kwh);
  });

  it("el techo grande sí favorece al módulo grande", () => {
    const nave: Roof = { ...TECHO, area: 400 };
    const chico = panelFit({ w: 400, area: 2.14, ppw: 5 }, nave, PHYS);
    const grande = panelFit({ w: 740, area: 3.11, ppw: 5 }, nave, PHYS);
    expect(grande.kwh).toBeGreaterThan(chico.kwh);
  });

  it("el arreglo declarado concuerda con la cantidad", () => {
    for (const p of CEC.slice(0, 30)) {
      const f = panelFit(p, TECHO, PHYS);
      expect(f.count).toBeLessThanOrEqual(f.rows * f.perRow);
      expect(f.kwp).toBeCloseTo((f.count * p.w) / 1000, 6);
    }
  });

  it("el costo por kWh anual usa el precio del módulo y su energía", () => {
    const f = panelFit({ w: 550, area: 2.5, ppw: 4 }, TECHO, PHYS);
    expect(f.moduleCost).toBeCloseTo(4 * f.count * 550, 6);
    expect(f.mxnPerKwh).toBeCloseTo(f.moduleCost / f.kwh, 6);
  });

  it("un techo sin superficie no produce divisiones por cero ni valores negativos", () => {
    const f = panelFit({ w: 550, area: 2.5, ppw: 4 }, { ...TECHO, area: 0 }, PHYS);
    expect(f.count).toBe(0);
    expect(f.kwh).toBe(0);
    expect(f.mxnPerKwh).toBe(Infinity);
  });

  it("la sombra reduce la energía pero no cuántos caben", () => {
    const claro = panelFit({ w: 550, area: 2.5, ppw: 4 }, TECHO, PHYS);
    const sombra = panelFit({ w: 550, area: 2.5, ppw: 4 }, { ...TECHO, shade: 40 }, PHYS);
    expect(sombra.count).toBe(claro.count);
    expect(sombra.kwh).toBeCloseTo(claro.kwh * 0.6, 6);
  });

  it("todo el catálogo devuelve cifras finitas y no negativas", () => {
    for (const p of CEC) {
      const f = panelFit(p, TECHO, PHYS);
      expect(Number.isFinite(f.count)).toBe(true);
      expect(f.count).toBeGreaterThanOrEqual(0);
      expect(f.kwh).toBeGreaterThanOrEqual(0);
      expect(f.gap).toBeGreaterThan(0);
    }
  });
});
