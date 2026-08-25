import { describe, it, expect } from "vitest";
import {
  buildCapex, BOS_MXN_PER_W, TURNKEY_BAND, MODULE_SHARE_BAND, porcentajesEnteros, repartirEnteros,
} from "./capex";
import { compute, monthlyProduction, type Design, type Panel } from "./solar";
import { modulePrice } from "./price";
import { SITES } from "./site";

const panel = (ppw: number): Panel => ({
  brand: "Jinko Solar Co Ltd", model: "T-630", w: 630, eff: 23.3, temp: -0.3,
  area: 2.7, voc: 41.2, vmp: 34.6, isc: 18.6, imp: 18.2, betaVoc: -0.103,
  ppw, priceOrigin: "banda", warr: null,
});

const design = (ppw: number, extra: Partial<Design> = {}): Design => ({
  lat: 20.6597, lng: -103.3496, yield: 1880, area: 180,
  tilt: 18, az: 180, shade: 0, type: "com", panel: panel(ppw), ...extra,
});

/**
 * El defecto que estas pruebas impiden repetir: la inversión era
 * `kwp * 1000 * CAPEX_MXN_PER_W[type]`, una constante por tipo de proyecto, y `panel.ppw` no
 * entraba en la economía. El instalador capturaba su costo real, el catálogo se reordenaba, y
 * el retorno y la propuesta impresa no cambiaban un peso.
 */

describe("el costo del módulo llega de verdad al retorno", () => {
  it("un módulo más barato baja la inversión", () => {
    const caro = compute(design(6.0));
    const barato = compute(design(3.6));
    expect(barato.capex).toBeLessThan(caro.capex);
    // Ambos deben instalar lo mismo: solo cambia el precio, no la geometría.
    expect(barato.n).toBe(caro.n);
    expect(barato.kwh).toBeCloseTo(caro.kwh, 6);
  });

  it("un módulo más barato acorta el retorno", () => {
    expect(compute(design(3.6)).payback).toBeLessThan(compute(design(6.0)).payback);
  });

  it("la diferencia de precio se traslada íntegra a la inversión", () => {
    const caro = compute(design(6.0));
    const barato = compute(design(3.6));
    const esperada = (6.0 - 3.6) * caro.n * 630;
    expect(caro.capex - barato.capex).toBeCloseTo(esperada, 4);
  });

  it("el renglón de módulos coincide con precio × watts instalados", () => {
    const r = compute(design(4.25));
    const modulos = r.costs.lines.find((l) => l.key === "modulos")!;
    expect(modulos.mxn).toBeCloseTo(4.25 * r.n * 630, 6);
    expect(modulos.origin).toBe("medido");
  });
});

describe("desglose por partidas", () => {
  it("las partidas suman el total", () => {
    const b = buildCapex(10000, 45000, "res");
    const suma = b.lines.reduce((s, l) => s + l.mxn, 0);
    expect(suma).toBeCloseTo(b.total, 6);
  });

  it("las fracciones suman 1", () => {
    const b = buildCapex(10000, 45000, "res");
    expect(b.lines.reduce((s, l) => s + l.share, 0)).toBeCloseTo(1, 6);
  });

  it("solo los módulos se declaran medidos; el resto es proporción", () => {
    const b = buildCapex(10000, 45000, "res");
    expect(b.lines.filter((l) => l.origin === "medido").map((l) => l.key)).toEqual(["modulos"]);
    expect(b.lines.filter((l) => l.origin === "proporcion").length).toBe(5);
  });

  it("el resto del sistema NO depende de qué módulo se elija", () => {
    const barato = buildCapex(10000, 30000, "res");
    const caro = buildCapex(10000, 70000, "res");
    for (const key of ["inversor", "estructura", "electrico", "obra", "tramite"]) {
      const a = barato.lines.find((l) => l.key === key)!.mxn;
      const b = caro.lines.find((l) => l.key === key)!.mxn;
      expect(b).toBeCloseTo(a, 6);
    }
    // Pero el total sí cambia, y solo por los módulos.
    expect(caro.total - barato.total).toBeCloseTo(40000, 6);
  });
});

describe("anclaje a la banda llave en mano verificada", () => {
  it("con un módulo típico el total cae dentro de 15-28 MXN/Wp en los tres tipos", () => {
    const ppw = modulePrice("Jinko Solar Co Ltd", 22).mxnPerWp;
    for (const type of ["res", "com", "ind"] as const) {
      const b = buildCapex(10000, ppw * 10000, type);
      expect(b.mxnPerWp).toBeGreaterThanOrEqual(TURNKEY_BAND.min);
      expect(b.mxnPerWp).toBeLessThanOrEqual(TURNKEY_BAND.max);
      expect(b.inBand).toBe(true);
    }
  });

  it("el resto del sistema baja con la escala del proyecto", () => {
    expect(BOS_MXN_PER_W.res).toBeGreaterThan(BOS_MXN_PER_W.com);
    expect(BOS_MXN_PER_W.com).toBeGreaterThan(BOS_MXN_PER_W.ind);
  });

  it("señala cuando el total se sale de la banda en vez de callarlo", () => {
    // Un módulo absurdamente caro empuja el total fuera de la banda: hay que verlo.
    const b = buildCapex(10000, 40 * 10000, "res");
    expect(b.inBand).toBe(false);
  });

  it("reporta el peso del módulo en lugar de imponerlo", () => {
    // La investigación decía 40-50 %, pero con precios de 2026 sale mucho menos. El modelo
    // no fuerza la proporción: la calcula y la expone.
    const ppw = modulePrice("Jinko Solar Co Ltd", 22).mxnPerWp;
    const b = buildCapex(10000, ppw * 10000, "com");
    expect(b.moduleShare).toBeGreaterThan(MODULE_SHARE_BAND.min);
    expect(b.moduleShare).toBeLessThan(0.45);
    expect(b.shareReasonable).toBe(true);
  });

  it("marca como no razonable un reparto imposible", () => {
    expect(buildCapex(10000, 1, "res").shareReasonable).toBe(false);
  });
});

describe("el instalador puede imponer su propio costo de sistema", () => {
  it("el costo capturado reemplaza el valor por omisión", () => {
    const propio = buildCapex(10000, 50000, "res", 9);
    expect(propio.total).toBeCloseTo(50000 + 9 * 10000, 6);
    expect(propio.total).toBeLessThan(buildCapex(10000, 50000, "res").total);
  });

  it("un valor inválido no se acepta y se usa el por omisión", () => {
    const base = buildCapex(10000, 50000, "res").total;
    expect(buildCapex(10000, 50000, "res", 0).total).toBeCloseTo(base, 6);
    expect(buildCapex(10000, 50000, "res", -5).total).toBeCloseTo(base, 6);
  });

  it("llega desde el diseño hasta el retorno", () => {
    const caro = compute(design(4.5, { bosPerW: 20 }));
    const barato = compute(design(4.5, { bosPerW: 9 }));
    expect(barato.capex).toBeLessThan(caro.capex);
    expect(barato.payback).toBeLessThan(caro.payback);
  });
});

describe("casos límite", () => {
  it("cero watts no divide por cero", () => {
    const b = buildCapex(0, 0, "res");
    expect(b.total).toBe(0);
    expect(b.mxnPerWp).toBe(0);
    expect(b.inBand).toBe(false);
  });

  it("un costo de módulo negativo se trata como cero", () => {
    const b = buildCapex(10000, -5000, "res");
    expect(b.lines.find((l) => l.key === "modulos")!.mxn).toBe(0);
    expect(b.total).toBeCloseTo(BOS_MXN_PER_W.res * 10000, 6);
  });

  /** Esta prueba pedía `isFinite(payback)` y por eso aceptaba el 0 que devolvía antes: en
   * pantalla ese 0 se leía como "retorno inmediato" justo cuando no cabe ningún módulo. Lo
   * correcto es declararlo imposible. */
  it("un sistema sin módulos instalables se declara imposible, no de retorno inmediato", () => {
    const r = compute(design(5, { area: 0 }));
    expect(r.n).toBe(0);
    expect(r.capex).toBe(0);
    expect(r.noCabe).toBe(true);
    expect(r.payback).toBe(Infinity);
    expect(r.payback).not.toBe(0);
  });
});

/**
 * Los porcentajes del desglose tienen que sumar 100.
 *
 * Redondear cada partida por su cuenta no cuadra: medido sobre 600 combinaciones de módulo, tipo de
 * proyecto y superficie, **325 —el 54 %— sumaban 99 o 101**. Los montos en pesos sí cuadraban
 * siempre; era solo la columna de porcentajes. En una cotización que ve el cliente, un desglose que
 * suma 101 % es justo lo que se nota.
 */
describe("porcentajes enteros del desglose", () => {
  it("suman 100 en todas las combinaciones del catálogo", () => {
    let casos = 0;
    // se barre el precio por watt del módulo, que es lo que mueve el reparto entre partidas
    for (let ppw = 3.1; ppw <= 6.2; ppw += 0.1) {
      for (const w of [4000, 9800, 12500, 25920, 48000]) {
        for (const type of ["res", "com", "ind"] as const) {
          const cb = buildCapex(w, ppw * w, type);
          if (cb.total <= 0) continue;
          casos++;
          const pcts = porcentajesEnteros(cb.lines.map((l) => l.share));
          expect(pcts.reduce((a, b) => a + b, 0), `ppw ${ppw.toFixed(1)} ${type} ${w}W`).toBe(100);
        }
      }
    }
    expect(casos, "el barrido no produjo casos").toBeGreaterThan(100);
  });

  /* Cada valor mostrado queda a menos de un punto del real: es lo mejor posible con enteros. */
  it("ningún porcentaje se desvía más de un punto del exacto", () => {
    const cb = buildCapex(25920, 4.2 * 25920, "com");
    const pcts = porcentajesEnteros(cb.lines.map((l) => l.share));
    cb.lines.forEach((l, i) => {
      expect(Math.abs(pcts[i] - l.share * 100)).toBeLessThan(1);
    });
  });

  it("reparte la unidad que falta al resto más grande", () => {
    // tres partes de un tercio: 33.33 cada una, suman 99 al truncar
    const r = porcentajesEnteros([1 / 3, 1 / 3, 1 / 3]);
    expect(r.reduce((a, b) => a + b, 0)).toBe(100);
    expect(r.filter((x) => x === 34)).toHaveLength(1);
  });

  /**
   * A QUIÉN se le da la unidad, no solo que la suma cuadre.
   *
   * El caso simétrico de tres tercios no distingue nada: da igual a cuál se le sume. Y la cota de
   * «menos de un punto» tampoco, porque truncar y sumar como máximo 1 la cumple siempre, sea a quien
   * sea. Comprobado por mutación: ordenar por el resto más PEQUEÑO pasaba las 23 pruebas. Lo que el
   * orden decide es minimizar el error total, y eso hay que afirmarlo con restos distintos.
   */
  it("con restos distintos, la unidad va al mayor y no a otro", () => {
    // 33.3, 33.3, 33.4 → truncados 33+33+33 = 99, falta 1; el resto mayor es el tercero
    const r = porcentajesEnteros([0.333, 0.333, 0.334]);
    expect(r).toEqual([33, 33, 34]);
  });

  it("minimiza la desviación total, no solo la individual", () => {
    const shares = [0.401, 0.299, 0.3];
    const r = porcentajesEnteros(shares);
    expect(r.reduce((a, b) => a + b, 0)).toBe(100);
    const error = r.reduce((a, v, i) => a + Math.abs(v - shares[i] * 100), 0);
    // cualquier otro reparto que sume 100 desvía al menos tanto
    const alternativas = [[41, 29, 30], [40, 30, 30], [40, 29, 31]];
    for (const alt of alternativas) {
      const e = alt.reduce((a, v, i) => a + Math.abs(v - shares[i] * 100), 0);
      expect(error).toBeLessThanOrEqual(e + 1e-9);
    }
  });

  /* Si los shares no suman 1 no se inventan puntos: se devuelve el piso. */
  it("no fuerza 100 cuando los shares no son una partición", () => {
    expect(porcentajesEnteros([]).length).toBe(0);
    expect(porcentajesEnteros([0.1, 0.1]).reduce((a, b) => a + b, 0)).toBe(20);
  });
});

/**
 * El reparto general, sobre el caso que lo motivó: los doce meses del perfil.
 *
 * Redondear cada mes por su cuenta descuadraba en **332 de 558 perfiles medidos (59.5 %)**, con
 * diferencias de −3 a +3 kWh. La magnitud es pequeña —consistencia, no exactitud, muy distinto del
 * punto sobre 100 de los porcentajes— pero quien sume los doce meses debe obtener el anual.
 */
describe("reparto entero general", () => {
  it("los doce meses suman el anual en todos los sitios medidos", () => {
    let casos = 0;
    for (const s of Object.values(SITES)) {
      for (const anual of [4200, 9800, 24830, 41383, 49659, 103000]) {
        const { data } = monthlyProduction(anual, s);
        expect(data).toHaveLength(12);
        const meses = repartirEnteros(data.map((d) => d.kwh), anual);
        casos++;
        expect(meses.reduce((a, b) => a + b, 0), `${s.nombre} ${anual}`).toBe(Math.round(anual));
      }
    }
    expect(casos).toBeGreaterThan(500);
  });

  it("cada mes queda a menos de un kWh del exacto", () => {
    const s = Object.values(SITES)[0];
    const { data } = monthlyProduction(41383, s);
    const meses = repartirEnteros(data.map((d) => d.kwh), 41383);
    data.forEach((d, i) => expect(Math.abs(meses[i] - d.kwh)).toBeLessThan(1));
  });

  /* Si las partes no suman el total no se inventan unidades para cuadrar. */
  it("no fuerza el total cuando las partes no lo componen", () => {
    expect(repartirEnteros([1, 1], 100)).toEqual([1, 1]);
    expect(repartirEnteros([], 100)).toEqual([]);
  });
})
