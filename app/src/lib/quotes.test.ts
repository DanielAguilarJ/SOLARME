import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  loadQuotes, setQuote, clearQuote, clearAllQuotes, quoteFor, quoteCount,
  isValidQuote, MIN_QUOTE, MAX_QUOTE,
} from "./quotes";
import { enrichPanels } from "./price";

/** localStorage mínimo en memoria: las pruebas no deben depender del navegador. */
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

describe("validación: un dedazo no puede entrar al modelo económico", () => {
  it("acepta valores dentro de la banda razonable en pesos", () => {
    for (const v of [1, 3.9, 5.2, 12, 40]) expect(isValidQuote(v)).toBe(true);
  });

  it("rechaza lo que parece dólares escritos en un campo de pesos", () => {
    // 0.28 y 0.34 eran los valores viejos en USD/W: si alguien los escribe aquí, se rechazan.
    for (const v of [0, 0.28, 0.34, 0.99]) expect(isValidQuote(v)).toBe(false);
  });

  it("rechaza negativos, absurdos y no números", () => {
    for (const v of [-1, -0.5, 41, 1e9, NaN, Infinity]) expect(isValidQuote(v)).toBe(false);
  });

  it("los límites son inclusivos", () => {
    expect(isValidQuote(MIN_QUOTE)).toBe(true);
    expect(isValidQuote(MAX_QUOTE)).toBe(true);
  });
});

describe("guardar y quitar cotizaciones sin mutar", () => {
  it("setQuote devuelve un objeto nuevo", () => {
    const a = {};
    const b = setQuote(a, "Jinko Solar Co Ltd", 4.1);
    expect(a).toEqual({});
    expect(quoteFor(b, "Jinko Solar Co Ltd")).toBe(4.1);
  });

  it("la marca se normaliza a minúsculas en ambos sentidos", () => {
    const q = setQuote({}, "JINKO Solar Co Ltd", 4.1);
    expect(quoteFor(q, "jinko solar co ltd")).toBe(4.1);
    expect(quoteFor(q, "Jinko Solar Co Ltd")).toBe(4.1);
  });

  it("un valor inválido no ensucia el estado", () => {
    const q = setQuote({}, "Jinko", 0.3);
    expect(quoteCount(q)).toBe(0);
  });

  it("clearQuote quita solo esa marca y no muta", () => {
    const a = setQuote(setQuote({}, "Jinko", 4.1), "Risen", 3.6);
    const b = clearQuote(a, "Jinko");
    expect(quoteCount(a)).toBe(2);
    expect(quoteCount(b)).toBe(1);
    expect(quoteFor(b, "Risen")).toBe(3.6);
  });

  it("clearQuote sobre una marca sin cotización devuelve el mismo objeto", () => {
    const a = setQuote({}, "Jinko", 4.1);
    expect(clearQuote(a, "Trina")).toBe(a);
  });

  it("clearAllQuotes deja el estado vacío", () => {
    setQuote({}, "Jinko", 4.1);
    expect(quoteCount(clearAllQuotes())).toBe(0);
  });
});

describe("persistencia entre sesiones", () => {
  it("lo guardado se vuelve a leer", () => {
    setQuote({}, "Jinko Solar Co Ltd", 4.25);
    expect(quoteFor(loadQuotes(), "Jinko Solar Co Ltd")).toBe(4.25);
  });

  it("almacenamiento vacío o corrupto no rompe la app", () => {
    expect(loadQuotes()).toEqual({});
    localStorage.setItem("solarme.quotes.v1", "{no es json");
    expect(loadQuotes()).toEqual({});
    localStorage.setItem("solarme.quotes.v1", "[1,2,3]");
    expect(loadQuotes()).toEqual({});
  });

  it("filtra al cargar los valores inválidos que hubiera en almacenamiento", () => {
    localStorage.setItem(
      "solarme.quotes.v1",
      JSON.stringify({ jinko: 4.1, risen: 0.28, trina: -5, longi: "cinco" })
    );
    const q = loadQuotes();
    expect(quoteCount(q)).toBe(1);
    expect(quoteFor(q, "jinko")).toBe(4.1);
  });
});

describe("la cotización llega de verdad al catálogo", () => {
  const RAW = [
    { brand: "Jinko Solar Co Ltd", model: "A", w: 550, eff: 21.5, temp: -0.29, area: 2.5, warr: null },
    { brand: "Risen Energy Co Ltd", model: "B", w: 550, eff: 21.5, temp: -0.29, area: 2.5, warr: null },
  ];

  it("la marca cotizada cambia de precio y de procedencia; las demás no", () => {
    const q = setQuote({}, "Jinko Solar Co Ltd", 3.95);
    const [jinko, risen] = enrichPanels(RAW, q);
    expect(jinko.ppw).toBe(3.95);
    expect(jinko.priceOrigin).toBe("cotizado");
    expect(risen.priceOrigin).toBe("banda");
    expect(risen.ppw).not.toBe(3.95);
  });

  it("sin cotizaciones, todo el catálogo queda en banda", () => {
    expect(enrichPanels(RAW, {}).every((p) => p.priceOrigin === "banda")).toBe(true);
  });

  it("quitar la cotización devuelve el módulo a su banda", () => {
    const conQuote = setQuote({}, "Jinko Solar Co Ltd", 3.95);
    const sinQuote = clearQuote(conQuote, "Jinko Solar Co Ltd");
    const [jinko] = enrichPanels(RAW, sinQuote);
    expect(jinko.priceOrigin).toBe("banda");
  });
});
