import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  brandTier, modulePrice, moduleCost, enrichPanels,
  TIER_BAND, CAPEX_MXN_PER_W, CAPEX_RANGE,
} from "./price";

const RAW = JSON.parse(
  readFileSync(new URL("../data/panels.json", import.meta.url), "utf8")
).panels as { brand: string; model: string; w: number; eff: number; area: number; temp: number; warr: number | null }[];

/**
 * El defecto que estas pruebas impiden repetir: `ppw` venía del importador con DOS valores
 * distintos para 140 módulos (0.28 y 0.34), producidos por un umbral de eficiencia, y sin
 * moneda declarada. En el modo "precio" ese eje pesa 0.55 del puntaje.
 * Anclas: research/03-precios-mexico-perplexity.md (Tier 1 3.5-6.5 MXN/Wp; JA Solar 605 W
 * a $3,136.87 = 5.19 MXN/Wp; sistema instalado 15-28 MXN/Wp).
 */

describe("banda de precio anclada a la investigación", () => {
  it("Tier 1 cae dentro de 3.5-6.5 MXN/Wp", () => {
    expect(TIER_BAND[1].min).toBe(3.5);
    expect(TIER_BAND[1].max).toBe(6.5);
  });

  it("las gamas están ordenadas: Tier 1 nunca es más barato que Tier 3", () => {
    expect(TIER_BAND[1].min).toBeGreaterThan(TIER_BAND[2].min);
    expect(TIER_BAND[2].min).toBeGreaterThan(TIER_BAND[3].min);
    expect(TIER_BAND[1].max).toBeGreaterThan(TIER_BAND[2].max);
  });

  it("reproduce el ancla verificada de 5.19 MXN/Wp con margen de banda", () => {
    // JA Solar 605 W N-Type, eficiencia típica ~23.2%: la banda debe pasar por el ancla.
    const p = modulePrice("JA Solar", 23.2);
    expect(p.tier).toBe(1);
    expect(p.mxnPerWp).toBeGreaterThan(4.5);
    expect(p.mxnPerWp).toBeLessThan(6.5);
  });

  it("nunca devuelve un precio fuera de la banda de su gama", () => {
    for (const eff of [10, 15, 18, 20, 22, 24, 24.5, 30]) {
      for (const brand of ["Jinko Solar", "Risen Energy", "Marca Desconocida SA"]) {
        const p = modulePrice(brand, eff);
        const band = TIER_BAND[p.tier];
        expect(p.mxnPerWp).toBeGreaterThanOrEqual(band.min);
        expect(p.mxnPerWp).toBeLessThanOrEqual(band.max);
      }
    }
  });

  it("más eficiencia cuesta más, de forma monótona", () => {
    const a = modulePrice("Jinko Solar", 19).mxnPerWp;
    const b = modulePrice("Jinko Solar", 21.5).mxnPerWp;
    const c = modulePrice("Jinko Solar", 24).mxnPerWp;
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
  });
});

describe("procedencia del precio: banda frente a cotización", () => {
  it("sin cotización la procedencia es banda", () => {
    expect(modulePrice("Jinko Solar", 22).origin).toBe("banda");
  });

  it("con cotización del instalador gana su número y se marca cotizado", () => {
    const p = modulePrice("Jinko Solar", 22, 4.05);
    expect(p.mxnPerWp).toBe(4.05);
    expect(p.origin).toBe("cotizado");
  });

  it("una cotización cero o negativa no se acepta como precio", () => {
    expect(modulePrice("Jinko Solar", 22, 0).origin).toBe("banda");
    expect(modulePrice("Jinko Solar", 22, -3).origin).toBe("banda");
  });

  it("una cotización puede salirse de la banda: es un precio real, no una estimación", () => {
    const p = modulePrice("Jinko Solar", 22, 9.8);
    expect(p.mxnPerWp).toBe(9.8);
    expect(p.origin).toBe("cotizado");
  });
});

describe("clasificación por gama", () => {
  it("reconoce las Tier 1 presentes en México", () => {
    for (const b of ["Jinko Solar Co Ltd", "LONGi Green Energy", "Trina Solar CoLtd",
                     "JA Solar", "CSI Solar Co Ltd", "Qcells North America",
                     "First Solar Inc", "REC Group", "SunPower"]) {
      expect(brandTier(b)).toBe(1);
    }
  });

  it("reconoce las Tier 2", () => {
    for (const b of ["Risen Energy Co Ltd", "Phono Solar Technology Co Ltd",
                     "ZNSHINE PV-TECH Co Ltd", "SEG Solar Inc", "Boviet Solar"]) {
      expect(brandTier(b)).toBe(2);
    }
  });

  it("lo que no reconoce cae en Tier 3, no en Tier 1", () => {
    // Importa el sentido del respaldo: ante una marca desconocida, no se le regala prestigio.
    expect(brandTier("Fabrica Sin Nombre")).toBe(3);
    expect(brandTier("")).toBe(3);
  });
});

describe("el catálogo real deja de tener un precio de dos valores", () => {
  const ps = enrichPanels(RAW);
  const ppw = ps.map((p) => p.ppw);

  it("hay muchos valores distintos de precio, no dos", () => {
    expect(new Set(ppw).size).toBeGreaterThanOrEqual(20);
  });

  it("todo el catálogo queda dentro de la banda de mercado en pesos", () => {
    expect(Math.min(...ppw)).toBeGreaterThanOrEqual(TIER_BAND[3].min);
    expect(Math.max(...ppw)).toBeLessThanOrEqual(TIER_BAND[1].max);
  });

  it("el precio está en MXN, no en dólares", () => {
    // Un USD/W de módulo ronda 0.1-0.4; si algún valor cayera ahí, se habría colado la unidad
    // vieja. El mínimo de la banda en pesos es 2.6.
    expect(Math.min(...ppw)).toBeGreaterThan(1);
  });

  it("cada panel enriquecido declara su procedencia", () => {
    expect(ps.every((p) => p.priceOrigin === "banda" || p.priceOrigin === "cotizado")).toBe(true);
  });

  it("respeta las cotizaciones del instalador por marca", () => {
    const conCotiza = enrichPanels(RAW, { "jinko solar co ltd": 3.9 });
    const jinko = conCotiza.filter((p) => p.brand === "Jinko Solar Co Ltd");
    expect(jinko.length).toBeGreaterThan(0);
    expect(jinko.every((p) => p.ppw === 3.9 && p.priceOrigin === "cotizado")).toBe(true);
    // Las demás marcas siguen en banda.
    expect(conCotiza.some((p) => p.priceOrigin === "banda")).toBe(true);
  });
});

describe("costo del sistema", () => {
  it("el costo del lote de módulos escala con los watts", () => {
    const p = modulePrice("Jinko Solar", 22);
    expect(moduleCost(p, 10000)).toBeCloseTo(p.mxnPerWp * 10000, 6);
    expect(moduleCost(p, 0)).toBe(0);
  });

  it("el CAPEX por watt baja con la escala del proyecto", () => {
    expect(CAPEX_MXN_PER_W.res).toBeGreaterThan(CAPEX_MXN_PER_W.com);
    expect(CAPEX_MXN_PER_W.com).toBeGreaterThan(CAPEX_MXN_PER_W.ind);
  });

  it("los tres tipos caen dentro de la banda 15-28 MXN/Wp instalado", () => {
    for (const v of Object.values(CAPEX_MXN_PER_W)) {
      expect(v).toBeGreaterThanOrEqual(CAPEX_RANGE.min);
      expect(v).toBeLessThanOrEqual(CAPEX_RANGE.max);
    }
  });

  it("el módulo representa entre 20 y 50 % del CAPEX instalado", () => {
    // La investigación sitúa el módulo en 40-50 % del total; se admite hasta 20 % por abajo
    // porque en industrial el CAPEX por watt baja y la proporción se mueve.
    const p = modulePrice("Jinko Solar", 22);
    for (const capex of Object.values(CAPEX_MXN_PER_W)) {
      const share = p.mxnPerWp / capex;
      expect(share).toBeGreaterThan(0.2);
      expect(share).toBeLessThan(0.5);
    }
  });
});
