// @vitest-environment happy-dom
/**
 * Rescate del análisis en curso.
 *
 * Un análisis vivía solo en la memoria de la pestaña hasta pulsar «Guardar»: el contorno del techo,
 * los obstáculos, el módulo elegido, el recibo capturado. En un teléfono eso no es un caso raro sino
 * el normal —el sistema descarta pestañas en segundo plano y basta una llamada entrante—, así que
 * diez minutos de trazo sobre una azotea se perdían sin que nadie tocara nada.
 *
 * Lo que se prueba con más cuidado es que el rescate NO se coma nada: que un almacén a medias o de
 * otra versión devuelva null en vez de un diseño roto, y que al guardar el proyecto de verdad el
 * rescate desaparezca en vez de quedar compitiendo con él.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { guardarEnCurso, leerEnCurso, olvidarEnCurso } from "./enCurso";
import { CITIES, type Design, type Panel } from "./solar";

const panel: Panel = {
  brand: "Test", model: "T-550", w: 550, eff: 21.3, temp: -0.34, area: 2.58,
  voc: 49.9, vmp: 41.8, isc: 14.0, imp: 13.2, betaVoc: -0.125, ppw: 5.2,
  priceOrigin: "banda", warr: 25,
};

const ciudad = CITIES.guadalajara;
const design: Design = {
  site: ciudad.site, lat: ciudad.lat, lng: ciudad.lng, yield: ciudad.yield,
  area: 60, tilt: 24, az: 180, shade: 0, type: "res", panel,
  outline: [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 6 }, { x: 0, y: 6 }],
};

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe("guardar y recuperar el análisis en curso", () => {
  it("lo guardado se recupera con su domicilio y su diseño", () => {
    expect(guardarEnCurso("Av. Chapultepec 100", "Guadalajara", design)).toBe(true);
    const r = leerEnCurso();
    expect(r?.address).toBe("Av. Chapultepec 100");
    expect(r?.city).toBe("Guadalajara");
    expect(r?.design.tilt).toBe(24);
  });

  it("conserva el contorno del techo, que es lo que más duele perder", () => {
    guardarEnCurso("Av. Chapultepec 100", "Guadalajara", design);
    expect(leerEnCurso()?.design.outline).toHaveLength(4);
  });

  it("sin nada guardado no hay rescate", () => {
    expect(leerEnCurso()).toBeNull();
  });

  it("sin dirección no se guarda: es el estado inicial, no trabajo a medias", () => {
    expect(guardarEnCurso("", "", design)).toBe(false);
    expect(guardarEnCurso("   ", "", design)).toBe(false);
    expect(leerEnCurso()).toBeNull();
  });

  it("descartarlo lo quita del almacén", () => {
    guardarEnCurso("Av. Chapultepec 100", "Guadalajara", design);
    olvidarEnCurso();
    expect(leerEnCurso()).toBeNull();
  });

  it("guarda despojado de la física del sitio, que se recalcula", () => {
    // meterla multiplicaría el tamaño del almacén sin añadir nada: son 102 sitios en memoria
    guardarEnCurso("Av. Chapultepec 100", "Guadalajara", design);
    const bruto = JSON.parse(localStorage.getItem("solarme.enCurso.v1")!);
    expect(bruto.design.site).toBeUndefined();
    expect(bruto.design.tilt).toBe(24);
  });

  it("un almacén lleno se reporta en vez de fingir que guardó", () => {
    const original = localStorage.setItem;
    localStorage.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    expect(guardarEnCurso("Av. Chapultepec 100", "Guadalajara", design)).toBe(false);
    localStorage.setItem = original;
  });
});

describe("un rescate que no sirve no se ofrece", () => {
  it("con basura en el almacén devuelve null, no un diseño roto", () => {
    localStorage.setItem("solarme.enCurso.v1", "{no es json");
    expect(leerEnCurso()).toBeNull();
  });

  it("un diseño incompleto se rechaza entero", () => {
    // se valida con la misma función que un respaldo importado: una sola definición de
    // «aprovechable», para que las dos copias no se separen
    localStorage.setItem(
      "solarme.enCurso.v1",
      JSON.stringify({ id: "en-curso", address: "x", city: "y", createdAt: 1, design: { tilt: 24 } }),
    );
    expect(leerEnCurso()).toBeNull();
  });

  it("un diseño con una inclinación imposible se rechaza", () => {
    guardarEnCurso("Av. Chapultepec 100", "Guadalajara", design);
    const doc = JSON.parse(localStorage.getItem("solarme.enCurso.v1")!);
    doc.design.tilt = 400;
    localStorage.setItem("solarme.enCurso.v1", JSON.stringify(doc));
    expect(leerEnCurso()).toBeNull();
  });

  it("sin domicilio en el archivo tampoco se ofrece", () => {
    guardarEnCurso("Av. Chapultepec 100", "Guadalajara", design);
    const doc = JSON.parse(localStorage.getItem("solarme.enCurso.v1")!);
    doc.address = "";
    localStorage.setItem("solarme.enCurso.v1", JSON.stringify(doc));
    expect(leerEnCurso()).toBeNull();
  });
});
