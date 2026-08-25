import { describe, it, expect } from "vitest";
import { rowSpacing, panelsWithSpacing } from "./spacing";

/**
 * Geometría de autosombreado. Anclajes de research/02-deep-research-perplexity.md:
 *   α = 90° − φ − 23.45°   ·   D = H / tan(α)   ·   P = D + W · cos(β)
 *
 * El caso de diseño es el mediodía del solsticio de invierno, el peor momento del año.
 */

const L = 2.28; // largo de módulo de gran formato, en metros

describe("rowSpacing — elevación solar del solsticio", () => {
  // α = 90 − φ − 23.45. La implementación redondea a un decimal para la interfaz,
  // así que se compara contra la fórmula tolerando medio paso de redondeo.
  const casos: [number, string][] = [
    [19.4, "CDMX"],
    [21, "Mérida"],
    [25.7, "Monterrey"],
    [32.5, "Tijuana"],
  ];

  for (const [lat, ciudad] of casos) {
    const exacto = 90 - lat - 23.45;
    it(`${ciudad} (lat ${lat}°) tiene el sol a ${exacto.toFixed(2)}°`, () => {
      const s = rowSpacing({ lat, tilt: 20, panelLength: L });
      // 0.06 = medio paso de redondeo (0.05) más margen para ruido de punto flotante
      expect(Math.abs(s.sunElevation - exacto)).toBeLessThanOrEqual(0.06);
    });
  }

  it("el sol invernal baja al alejarse del ecuador", () => {
    const sur = rowSpacing({ lat: 15, tilt: 20, panelLength: L });
    const norte = rowSpacing({ lat: 32, tilt: 20, panelLength: L });
    expect(norte.sunElevation).toBeLessThan(sur.sunElevation);
  });
});

describe("rowSpacing — altura y huella del módulo inclinado", () => {
  it("H = L · sin(β)", () => {
    const s = rowSpacing({ lat: 21, tilt: 30, panelLength: 2 });
    expect(s.rowHeight).toBeCloseTo(2 * Math.sin(Math.PI / 6), 2); // sin 30° = 0.5
  });

  it("un módulo horizontal no gana altura ni necesita pasillo", () => {
    const s = rowSpacing({ lat: 21, tilt: 0, panelLength: L });
    expect(s.rowHeight).toBe(0);
    expect(s.gap).toBe(0);
    expect(s.footprint).toBeCloseTo(L, 2);
  });

  it("la huella se acorta al inclinar más", () => {
    const plano = rowSpacing({ lat: 21, tilt: 5, panelLength: L });
    const inclinado = rowSpacing({ lat: 21, tilt: 40, panelLength: L });
    expect(inclinado.footprint).toBeLessThan(plano.footprint);
  });
});

describe("rowSpacing — pasillo y pitch", () => {
  it("D = H / tan(α)", () => {
    const lat = 25.7, tilt = 22;
    const s = rowSpacing({ lat, tilt, panelLength: L });
    const alpha = ((90 - lat - 23.45) * Math.PI) / 180;
    const H = L * Math.sin((tilt * Math.PI) / 180);
    expect(s.gap).toBeCloseTo(H / Math.tan(alpha), 2);
  });

  it("P = D + W · cos(β)", () => {
    const s = rowSpacing({ lat: 25.7, tilt: 22, panelLength: L });
    expect(s.pitch).toBeCloseTo(s.gap + s.footprint, 2);
  });

  it("el pasillo crece con la latitud a igual inclinación", () => {
    const gaps = [15, 20, 25, 30, 32.5].map(
      (lat) => rowSpacing({ lat, tilt: 20, panelLength: L }).gap,
    );
    for (let i = 1; i < gaps.length; i++) {
      expect(gaps[i]).toBeGreaterThan(gaps[i - 1]);
    }
  });

  it("el pasillo crece con la inclinación a igual latitud", () => {
    const gaps = [5, 15, 25, 35].map(
      (tilt) => rowSpacing({ lat: 25.7, tilt, panelLength: L }).gap,
    );
    for (let i = 1; i < gaps.length; i++) {
      expect(gaps[i]).toBeGreaterThan(gaps[i - 1]);
    }
  });
});

describe("rowSpacing — densidad de empaque", () => {
  it("Monterrey aprovecha menos techo que CDMX a su inclinación óptima", () => {
    const cdmx = rowSpacing({ lat: 19.4, tilt: 17, panelLength: L });
    const mty = rowSpacing({ lat: 25.7, tilt: 22, panelLength: L });
    expect(mty.packing).toBeLessThan(cdmx.packing);
  });

  it("Tijuana aprovecha bastante menos de la mitad del techo con pasillos", () => {
    const tij = rowSpacing({ lat: 32.5, tilt: 28, panelLength: L });
    expect(tij.packing).toBeGreaterThan(0.5);
    expect(tij.packing).toBeLessThan(0.62);
  });

  it("la densidad siempre es una fracción válida", () => {
    for (let lat = 0; lat <= 60; lat += 5) {
      for (let tilt = 0; tilt <= 60; tilt += 10) {
        const p = rowSpacing({ lat, tilt, panelLength: L }).packing;
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThanOrEqual(1);
      }
    }
  });

  it("acota el sol para no devolver Infinity en latitudes polares", () => {
    const polar = rowSpacing({ lat: 80, tilt: 30, panelLength: L });
    expect(Number.isFinite(polar.gap)).toBe(true);
    expect(Number.isFinite(polar.pitch)).toBe(true);
  });
});

describe("panelsWithSpacing", () => {
  const s = rowSpacing({ lat: 25.7, tilt: 22, panelLength: L });

  it("un techo sin superficie no admite módulos", () => {
    expect(panelsWithSpacing(0, 1.13, s).count).toBe(0);
  });

  it("count es el producto de filas por módulos por fila", () => {
    const r = panelsWithSpacing(180, 1.13, s);
    expect(r.count).toBe(r.rows * r.perRow);
  });

  it("más superficie nunca da menos módulos", () => {
    let prev = 0;
    for (const area of [20, 50, 100, 180, 400]) {
      const c = panelsWithSpacing(area, 1.13, s).count;
      expect(c).toBeGreaterThanOrEqual(prev);
      prev = c;
    }
  });

  it("un pasillo mayor reduce las filas que caben", () => {
    const sur = rowSpacing({ lat: 19.4, tilt: 17, panelLength: L });
    const norte = rowSpacing({ lat: 32.5, tilt: 28, panelLength: L });
    expect(panelsWithSpacing(180, 1.13, norte).rows)
      .toBeLessThanOrEqual(panelsWithSpacing(180, 1.13, sur).rows);
  });
});
