// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  _olvidarNegocio,
  faltaParaAviso,
  guardarNegocio,
  leerNegocio,
  NEGOCIO_VACIO,
  normalizaNegocio,
  suscribirNegocio,
  tieneNegocio,
  type Negocio,
} from "./negocio";

const completo: Negocio = {
  nombre: "Solar del Bajío S.A. de C.V.",
  domicilio: "Av. López Mateos 1200, León, Guanajuato",
  telefono: "477 123 4567",
  correo: "contacto@solardelbajio.mx",
  registro: "CFE-GD-2024-0192",
};

beforeEach(() => {
  localStorage.clear();
  _olvidarNegocio();
});

afterEach(() => {
  localStorage.clear();
  _olvidarNegocio();
});

describe("leer y guardar", () => {
  it("sin datos guardados devuelve todo vacío, no undefined", () => {
    expect(leerNegocio()).toEqual(NEGOCIO_VACIO);
  });

  it("lo guardado se vuelve a leer igual", () => {
    expect(guardarNegocio(completo)).toBe(true);
    _olvidarNegocio();
    expect(leerNegocio()).toEqual(completo);
  });

  it("recorta espacios sobrantes al guardar", () => {
    guardarNegocio({ ...NEGOCIO_VACIO, nombre: "  Solar Norte  " });
    expect(leerNegocio().nombre).toBe("Solar Norte");
  });

  it("un almacén lleno se reporta en vez de fingir que guardó", () => {
    const original = localStorage.setItem;
    localStorage.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    expect(guardarNegocio(completo)).toBe(false);
    localStorage.setItem = original;
  });

  it("un contenido corrupto no rompe el arranque", () => {
    localStorage.setItem("solarme.negocio.v1", "{no es json");
    _olvidarNegocio();
    expect(leerNegocio()).toEqual(NEGOCIO_VACIO);
  });

  it("avisa a quien esté suscrito al guardar", () => {
    const espia = vi.fn();
    const baja = suscribirNegocio(espia);
    guardarNegocio(completo);
    expect(espia).toHaveBeenCalled();
    baja();
  });

  it("se entera de un cambio hecho en otra pestaña", () => {
    const espia = vi.fn();
    const baja = suscribirNegocio(espia);
    localStorage.setItem("solarme.negocio.v1", JSON.stringify(completo));
    window.dispatchEvent(new StorageEvent("storage", { key: "solarme.negocio.v1" }));
    expect(espia).toHaveBeenCalled();
    expect(leerNegocio().nombre).toBe(completo.nombre);
    baja();
  });
});

describe("normalizaNegocio", () => {
  it("se queda con lo aprovechable en vez de rechazarlo todo", () => {
    // perder el teléfono porque alguien guardó un número donde iba texto sería peor que ignorarlo
    const n = normalizaNegocio({ nombre: "Solar Sur", telefono: 4771234567, correo: null });
    expect(n.nombre).toBe("Solar Sur");
    expect(n.telefono).toBe("");
    expect(n.correo).toBe("");
  });

  it("con basura devuelve el vacío", () => {
    for (const basura of [null, undefined, 42, "texto", []]) {
      expect(normalizaNegocio(basura)).toEqual(NEGOCIO_VACIO);
    }
  });

  it("acota la longitud de cada campo", () => {
    const largo = "x".repeat(500);
    expect(normalizaNegocio({ nombre: largo }).nombre.length).toBe(200);
  });
});

describe("qué falta", () => {
  it("sin nada, no hay negocio que declarar", () => {
    expect(tieneNegocio(NEGOCIO_VACIO)).toBe(false);
  });

  it("basta un nombre, un teléfono o un correo para identificarlo", () => {
    for (const campo of ["nombre", "telefono", "correo"] as const) {
      expect(tieneNegocio({ ...NEGOCIO_VACIO, [campo]: "algo" }), campo).toBe(true);
    }
    // el domicilio y el registro solos no identifican a nadie a quien llamar
    expect(tieneNegocio({ ...NEGOCIO_VACIO, domicilio: "una calle" })).toBe(false);
  });

  it("el aviso pide responsable, domicilio y contacto", () => {
    expect(faltaParaAviso(NEGOCIO_VACIO)).toEqual([
      "nombre o razón social",
      "domicilio",
      "teléfono o correo",
    ]);
    expect(faltaParaAviso(completo)).toEqual([]);
  });

  it("con solo correo, el contacto ya está cubierto", () => {
    const n = { ...completo, telefono: "" };
    expect(faltaParaAviso(n)).toEqual([]);
  });

  it("el registro ante la CFE no es requisito del aviso", () => {
    expect(faltaParaAviso({ ...completo, registro: "" })).toEqual([]);
  });
});
