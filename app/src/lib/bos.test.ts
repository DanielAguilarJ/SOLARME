import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  loadBosRates, setBos, clearBos, bosFor, isOwnBos, isValidBos, MIN_BOS, MAX_BOS,
} from "./bos";
import { BOS_MXN_PER_W, buildCapex } from "./capex";
import { compute, type Design, type Panel } from "./solar";

function fakeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: () => null,
    length: 0,
  } as unknown as Storage;
}

beforeEach(() => {
  vi.stubGlobal("localStorage", fakeStorage());
});

const panel: Panel = {
  brand: "Jinko Solar Co Ltd", model: "T-630", w: 630, eff: 23.3, temp: -0.3,
  area: 2.7, voc: 49.9, vmp: 41.8, isc: 14.0, imp: 13.2, betaVoc: -0.125, ppw: 4.5, priceOrigin: "banda", warr: null,
};
const design = (extra: Partial<Design> = {}): Design => ({
  lat: 20.6597, lng: -103.3496, yield: 1880, area: 180,
  tilt: 18, az: 180, shade: 0, type: "com", panel, ...extra,
});

/**
 * El defecto que estas pruebas impiden repetir: `Design.bosPerW` y el `bosOverride` de
 * `buildCapex` estaban construidos y probados, pero ninguna interfaz los escribía. Un camino de
 * código inalcanzable: la tarifa del instalador nunca podía llegar al modelo económico.
 */

describe("validación de la tarifa", () => {
  it("acepta tarifas plausibles del resto del sistema", () => {
    for (const v of [3, 8, 13, 16, 24, 40]) expect(isValidBos(v)).toBe(true);
  });

  it("rechaza lo que no alcanza ni para el inversor", () => {
    for (const v of [0, 0.5, 2.9]) expect(isValidBos(v)).toBe(false);
  });

  it("rechaza negativos, absurdos y no números", () => {
    for (const v of [-1, 41, 1e6, NaN, Infinity]) expect(isValidBos(v)).toBe(false);
  });

  it("los límites son inclusivos", () => {
    expect(isValidBos(MIN_BOS)).toBe(true);
    expect(isValidBos(MAX_BOS)).toBe(true);
  });
});

describe("la tarifa se guarda por tipo de proyecto, no por proyecto", () => {
  it("cada tipo lleva su propia tarifa", () => {
    let r = setBos({}, "res", 18);
    r = setBos(r, "com", 12);
    expect(bosFor(r, "res")).toBe(18);
    expect(bosFor(r, "com")).toBe(12);
    // El tipo sin capturar sigue en la referencia de mercado.
    expect(bosFor(r, "ind")).toBe(BOS_MXN_PER_W.ind);
  });

  it("sin capturar nada se usa la referencia de mercado", () => {
    for (const t of ["res", "com", "ind"] as const) {
      expect(bosFor({}, t)).toBe(BOS_MXN_PER_W[t]);
      expect(isOwnBos({}, t)).toBe(false);
    }
  });

  it("distingue la tarifa propia de la de referencia", () => {
    const r = setBos({}, "com", 12);
    expect(isOwnBos(r, "com")).toBe(true);
    expect(isOwnBos(r, "res")).toBe(false);
  });

  it("no muta el objeto anterior", () => {
    const a = {};
    const b = setBos(a, "res", 18);
    expect(a).toEqual({});
    expect(b.res).toBe(18);
  });

  it("un valor inválido no ensucia el estado", () => {
    expect(setBos({}, "res", 0.2)).toEqual({});
    expect(setBos({}, "res", 99)).toEqual({});
  });

  it("clearBos devuelve el tipo a la referencia sin tocar los demás", () => {
    let r = setBos(setBos({}, "res", 18), "com", 12);
    r = clearBos(r, "res");
    expect(isOwnBos(r, "res")).toBe(false);
    expect(bosFor(r, "res")).toBe(BOS_MXN_PER_W.res);
    expect(bosFor(r, "com")).toBe(12);
  });

  it("clearBos sobre un tipo sin tarifa devuelve el mismo objeto", () => {
    const a = setBos({}, "res", 18);
    expect(clearBos(a, "com")).toBe(a);
  });
});

describe("persistencia", () => {
  it("lo guardado se vuelve a leer", () => {
    setBos({}, "com", 11.5);
    expect(bosFor(loadBosRates(), "com")).toBe(11.5);
  });

  it("almacenamiento vacío, corrupto o en arreglo no rompe la app", () => {
    expect(loadBosRates()).toEqual({});
    localStorage.setItem("solarme.bos.v1", "{roto");
    expect(loadBosRates()).toEqual({});
    localStorage.setItem("solarme.bos.v1", "[10,20,30]");
    expect(loadBosRates()).toEqual({});
  });

  it("filtra al cargar los valores inválidos y las claves desconocidas", () => {
    localStorage.setItem(
      "solarme.bos.v1",
      JSON.stringify({ res: 18, com: 0.3, ind: "diez", otro: 15 })
    );
    const r = loadBosRates();
    expect(r).toEqual({ res: 18 });
  });
});

describe("la tarifa llega hasta el retorno", () => {
  it("una tarifa más baja abarata el sistema y acorta el retorno", () => {
    const caro = compute(design({ bosPerW: bosFor(setBos({}, "com", 20), "com") }));
    const barato = compute(design({ bosPerW: bosFor(setBos({}, "com", 9), "com") }));
    expect(barato.capex).toBeLessThan(caro.capex);
    expect(barato.payback).toBeLessThan(caro.payback);
    // Lo instalado no cambia: solo el costo.
    expect(barato.n).toBe(caro.n);
    expect(barato.kwh).toBeCloseTo(caro.kwh, 6);
  });

  it("la diferencia de tarifa se traslada íntegra a la inversión", () => {
    const a = compute(design({ bosPerW: 20 }));
    const b = compute(design({ bosPerW: 9 }));
    expect(a.capex - b.capex).toBeCloseTo((20 - 9) * a.kwp * 1000, 4);
  });

  it("no cambia el renglón de módulos, que es el único medido", () => {
    const a = compute(design({ bosPerW: 20 }));
    const b = compute(design({ bosPerW: 9 }));
    const mod = (r: typeof a) => r.costs.lines.find((l) => l.key === "modulos")!.mxn;
    expect(mod(b)).toBeCloseTo(mod(a), 6);
  });

  it("sin tarifa propia el resultado es idéntico al de la referencia", () => {
    const conRef = compute(design({ bosPerW: bosFor({}, "com") }));
    const sinNada = compute(design());
    expect(conRef.capex).toBeCloseTo(sinNada.capex, 6);
  });

  it("una tarifa propia baja puede sacar el total de la banda, y se avisa", () => {
    // Con 3 MXN/W el total queda muy por debajo de 15 MXN/Wp: el aviso tiene que dispararse.
    const r = compute(design({ bosPerW: 3 }));
    expect(r.costs.inBand).toBe(false);
  });

  it("buildCapex ignora una tarifa inválida y usa la de referencia", () => {
    const base = buildCapex(10000, 45000, "com").total;
    expect(buildCapex(10000, 45000, "com", 0).total).toBeCloseTo(base, 6);
    expect(buildCapex(10000, 45000, "com", -3).total).toBeCloseTo(base, 6);
  });
});
