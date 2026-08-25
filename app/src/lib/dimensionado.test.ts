import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { compute, CITIES, type Design, type Panel } from "./solar";
import { enrichPanels } from "./price";
import { ajustarAlConsumo, rectangulo } from "./dimensionado";

const panels: Panel[] = enrichPanels(
  JSON.parse(readFileSync(new URL("../data/panels.json", import.meta.url), "utf8")).panels,
);
const modulo = panels.find((x) => x.w >= 540 && x.voc)!;
const juarez = Object.values(CITIES).find((x) => x.name.includes("Juárez"))!;

/** Techo comercial con recibo real de 1200 kWh/mes. */
const diseño = (area: number, kwh = 2400): Design =>
  ({
    panel: modulo, type: "com", area, tilt: 20, az: 180, shade: 0,
    site: juarez.site, lat: juarez.lat, lng: juarez.lng, yield: juarez.yield,
    runMeters: 40, inverterWindow: "com1000",
    bill: { kwh, mxn: 11800, meses: 2 },
  }) as unknown as Design;

describe("ajuste del arreglo al consumo", () => {
  it("un techo sobredimensionado señala los módulos que no pagan", () => {
    const r = compute(diseño(200));
    const a = ajustarAlConsumo(r)!;
    expect(r.cov).toBeGreaterThan(120);          // el caso es de verdad excesivo
    expect(a.sobrantes).toBeGreaterThan(0);
    expect(a.ajustado).toBeLessThan(a.actual);
    expect(a.limitaElTecho).toBe(false);
  });

  /** Lo que hace verdadera la afirmación: el ahorro ya estaba topado al consumo. */
  it("quitar los sobrantes libera inversión sin tocar el ahorro anual", () => {
    const r = compute(diseño(200));
    const a = ajustarAlConsumo(r)!;
    expect(a.ahorroCapex).toBeGreaterThan(0);
    // el retorno mejora precisamente porque el ahorro no baja
    expect(a.paybackAjustado).toBeLessThan(r.payback);
    // y la inversión liberada es proporcional a los módulos quitados
    expect(a.ahorroCapex).toBeCloseTo((r.capex * a.sobrantes) / a.actual, 6);
  });

  it("dos techos distintos que sobran convergen al mismo arreglo ajustado", () => {
    const grande = ajustarAlConsumo(compute(diseño(200)))!;
    const medio = ajustarAlConsumo(compute(diseño(150)))!;
    // el consumo es el mismo, así que el número que lo cubre también
    expect(grande.ajustado).toBe(medio.ajustado);
    expect(grande.paybackAjustado).toBeCloseTo(medio.paybackAjustado, 1);
  });

  it("cuando el techo no alcanza el consumo, no hay nada que recortar", () => {
    const r = compute(diseño(100));
    const a = ajustarAlConsumo(r)!;
    expect(r.cov).toBeLessThan(100);
    expect(a.limitaElTecho).toBe(true);
    expect(a.sobrantes).toBe(0);
    expect(a.ahorroCapex).toBe(0);
    expect(a.paybackAjustado).toBe(r.payback);
  });

  /* Sin consumo del cliente no se puede hablar de cobertura: se declara la ausencia. */
  it("sin recibo no inventa un ajuste", () => {
    const sinRecibo = { ...diseño(200) } as Design;
    delete (sinRecibo as { bill?: unknown }).bill;
    const r = compute(sinRecibo);
    // si el modelo estima un consumo por tipo de proyecto, el ajuste es legítimo;
    // lo que no puede pasar es que devuelva cifras con consumo cero
    const a = ajustarAlConsumo({ ...r, consumption: 0 });
    expect(a).toBeNull();
  });

  it("sin módulos colocados tampoco", () => {
    const r = compute(diseño(200));
    expect(ajustarAlConsumo({ ...r, placement: { ...r.placement, count: 0 } })).toBeNull();
  });

  /** El caso que motivó todo: un tercio del arreglo sin valor en un techo grande. */
  it("mide la magnitud, no solo el signo", () => {
    const r = compute(diseño(200));
    const a = ajustarAlConsumo(r)!;
    expect(a.sobrantes / a.actual).toBeGreaterThan(0.25);   // más de un cuarto del arreglo
    expect(a.ahorroCapex).toBeGreaterThan(100_000);         // más de cien mil pesos
    expect(r.payback - a.paybackAjustado).toBeGreaterThan(1); // más de un año de retorno
  });
});

/**
 * El número solo no basta: hay que decir el arreglo.
 *
 * Al medir qué conteos salen encogiendo el área en un techo de 200 m² aparecieron únicamente 24, 27,
 * 30, 40, 44 y 48 — el arreglo es un rectángulo, así que el conteo es filas × columnas. 32 no
 * aparecía, y el consejo lo nombraba: parecía inalcanzable. Sí lo es, pero NO LLENANDO el techo
 * (4 filas de 8), no encogiéndolo. Sin decir el arreglo, el instalador busca un área que no existe.
 */
describe("el arreglo ajustado es construible", () => {
  it("nombra filas y columnas, y su producto es el objetivo", () => {
    const r = compute(diseño(200));
    const a = ajustarAlConsumo(r)!;
    expect(a.arreglo).not.toBeNull();
    expect(a.arreglo!.filas * a.arreglo!.columnas).toBe(a.ajustado);
  });

  /**
   * Como propiedad sobre muchos casos, no sobre uno.
   *
   * Con un solo techo la prueba pasaba sin ejercitar el límite: 4×8 = 32 es un acierto exacto, así
   * que ampliar los límites de búsqueda seguía devolviendo lo mismo. Comprobado por mutación.
   * Barriendo áreas y consumos, alguna combinación sí obliga a salirse si no se respeta el techo.
   */
  it("nunca propone un arreglo que no quepa en el techo calculado", () => {
    let comprobados = 0;
    for (const area of [110, 130, 150, 170, 190, 200, 210]) {
      for (const kwh of [900, 1400, 1800, 2400, 3000, 3600]) {
        const r = compute(diseño(area, kwh));
        const a = ajustarAlConsumo(r);
        if (!a || !a.arreglo) continue;
        comprobados++;
        expect(a.arreglo.filas, `${area} m², ${kwh} kWh`)
          .toBeLessThanOrEqual(r.placement.rows);
        expect(a.arreglo.columnas, `${area} m², ${kwh} kWh`)
          .toBeLessThanOrEqual(r.placement.perRow);
        expect(a.arreglo.filas * a.arreglo.columnas).toBe(a.ajustado);
      }
    }
    expect(comprobados, "el barrido no produjo ningún arreglo").toBeGreaterThan(8);
  });

  /* Filas completas e iguales: así se montan los rieles y así quedan parejas las series. */
  it("las filas quedan iguales, no una a medias", () => {
    const a = ajustarAlConsumo(compute(diseño(200)))!;
    expect(a.ajustado % a.arreglo!.filas).toBe(0);
  });

  it("dos techos distintos llegan al mismo arreglo", () => {
    const g = ajustarAlConsumo(compute(diseño(200)))!;
    const m = ajustarAlConsumo(compute(diseño(150)))!;
    expect(g.arreglo).toEqual(m.arreglo);
  });

  it("cuando manda el techo no se inventa un arreglo", () => {
    const a = ajustarAlConsumo(compute(diseño(100)))!;
    expect(a.limitaElTecho).toBe(true);
    expect(a.arreglo).toBeNull();
  });
});


/**
 * El contrato del rectángulo, con límites sintéticos.
 *
 * Con los techos reales el límite no es determinante: un 4×12 alcanza el máximo sin salirse, así que
 * ampliar la búsqueda no cambia el resultado y ninguna prueba de integración lo distingue. Aquí sí.
 */
describe("rectángulo dentro de límites", () => {
  it("nunca excede las filas ni las columnas disponibles", () => {
    let casos = 0;
    for (const f of [1, 2, 3, 4, 5]) {
      for (const c of [1, 3, 6, 8, 12]) {
        for (const obj of [1, 5, 7, 20, 32, 47, 100]) {
          const r = rectangulo(obj, f, c);
          casos++;
          if (r === null) continue;
          expect(r.filas, `obj ${obj} en ${f}x${c}`).toBeLessThanOrEqual(f);
          expect(r.columnas, `obj ${obj} en ${f}x${c}`).toBeLessThanOrEqual(c);
          expect(r.filas * r.columnas).toBeLessThanOrEqual(obj);
        }
      }
    }
    expect(casos).toBe(5 * 5 * 7);
  });

  it("elige el mayor producto que no pasa del objetivo", () => {
    // en 4x12 con objetivo 32 el máximo posible es exactamente 32
    expect(rectangulo(32, 4, 12)!.filas * rectangulo(32, 4, 12)!.columnas).toBe(32);
    // en 3x8 con objetivo 20 no hay 20: el mayor que cabe es 18 (3x6)
    const r = rectangulo(20, 3, 8)!;
    expect(r.filas * r.columnas).toBe(18);
  });

  it("sin techo no devuelve arreglo", () => {
    expect(rectangulo(32, 0, 12)).toBeNull();
    expect(rectangulo(32, 4, 0)).toBeNull();
  });
});

/**
 * El tope aplicado tiene que dar exactamente lo que el consejo prometió.
 *
 * Antes de existir el tope, el consejo decía «el ahorro anual es el mismo». Al aplicarlo de verdad
 * resultó falso: la cobertura aterriza en 97 % y no en 100 %, porque `Math.floor` deja el arreglo
 * algo por debajo del consumo. El ahorro bajaba de $108,800 a $105,939 —un 2.6 %— y el consejo lo
 * negaba. Ahora se calcula, y estas pruebas exigen que coincida con lo realizado.
 */
describe("aplicar el tope cumple lo prometido", () => {
  const conTope = (area: number, kwh = 2400) => {
    const sin = compute(diseño(area, kwh));
    const a = ajustarAlConsumo(sin);
    if (!a?.arreglo) return null;
    return { sin, a, con: compute({ ...diseño(area, kwh), arregloTope: a.arreglo } as Design) };
  };

  it("coloca exactamente los módulos del arreglo prometido", () => {
    const c = conTope(200)!;
    expect(c.con.placement.count).toBe(c.a.ajustado);
    expect(c.con.placement.rows).toBe(c.a.arreglo!.filas);
    expect(c.con.placement.perRow).toBe(c.a.arreglo!.columnas);
  });

  it("el ahorro y el retorno realizados coinciden con los predichos", () => {
    let comprobados = 0;
    for (const area of [150, 170, 190, 200, 210]) {
      const c = conTope(area);
      if (!c) continue;
      comprobados++;
      expect(c.con.save, `${area} m² ahorro`).toBeCloseTo(c.a.ahorroAnualAjustado, 0);
      expect(c.con.payback, `${area} m² retorno`).toBeCloseTo(c.a.paybackAjustado, 1);
    }
    expect(comprobados, "el barrido no produjo ningún tope").toBeGreaterThan(2);
  });

  it("la inversión liberada es la que se prometió", () => {
    const c = conTope(200)!;
    expect(c.sin.capex - c.con.capex).toBeCloseTo(c.a.ahorroCapex, 0);
  });

  /* Las series se rehacen: un tope que dejara series desparejas complicaría el cableado. */
  it("las series quedan parejas tras el tope", () => {
    const c = conTope(200)!;
    expect(c.con.strings!.sobrantes).toBe(0);
    expect(c.con.strings!.strings * c.con.strings!.porString).toBe(c.con.placement.count);
  });

  it("quitar el tope devuelve el techo lleno", () => {
    const c = conTope(200)!;
    expect(c.con.placement.count).toBeLessThan(c.sin.placement.count);
    const devuelto = compute({ ...diseño(200), arregloTope: undefined } as Design);
    expect(devuelto.placement.count).toBe(c.sin.placement.count);
  });
});
