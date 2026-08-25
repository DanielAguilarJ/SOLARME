// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  _reiniciarInstalacion,
  escucharInstalacion,
  instalar,
  sePuedeInstalar,
  suscribirInstalacion,
  yaEstaInstalada,
} from "./instalacion";

/** Fabrica el evento del navegador con el resultado que se quiera probar. */
const evento = (respuesta: "accepted" | "dismissed", prompt = vi.fn().mockResolvedValue(undefined)) =>
  Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
    prompt,
    userChoice: Promise.resolve({ outcome: respuesta }),
  });

beforeEach(() => _reiniciarInstalacion());
afterEach(() => _reiniciarInstalacion());

describe("la oferta de instalar", () => {
  it("no se ofrece hasta que el navegador dice que se puede", () => {
    expect(sePuedeInstalar()).toBe(false);
  });

  it("retiene el evento del navegador, que solo llega una vez", () => {
    escucharInstalacion();
    window.dispatchEvent(evento("accepted"));
    expect(sePuedeInstalar()).toBe(true);
  });

  it("impide que el navegador se lo quede: sin eso el botón no serviría", () => {
    escucharInstalacion();
    const e = evento("accepted");
    window.dispatchEvent(e);
    // preventDefault sobre un evento cancelable marca defaultPrevented
    expect(e.defaultPrevented).toBe(true);
  });

  it("avisa a quien esté suscrito", () => {
    escucharInstalacion();
    const espia = vi.fn();
    suscribirInstalacion(espia);
    window.dispatchEvent(evento("accepted"));
    expect(espia).toHaveBeenCalled();
  });

  it("deja de avisar tras darse de baja", () => {
    escucharInstalacion();
    const espia = vi.fn();
    suscribirInstalacion(espia)();
    window.dispatchEvent(evento("accepted"));
    expect(espia).not.toHaveBeenCalled();
  });
});

describe("instalar", () => {
  it("abre el diálogo y devuelve que se aceptó", async () => {
    escucharInstalacion();
    const prompt = vi.fn().mockResolvedValue(undefined);
    window.dispatchEvent(evento("accepted", prompt));
    await expect(instalar()).resolves.toBe(true);
    expect(prompt).toHaveBeenCalled();
  });

  it("devuelve que no se aceptó cuando el usuario lo descarta", async () => {
    escucharInstalacion();
    window.dispatchEvent(evento("dismissed"));
    await expect(instalar()).resolves.toBe(false);
  });

  it("consume la oferta: el navegador no permite reabrir el mismo evento", async () => {
    escucharInstalacion();
    window.dispatchEvent(evento("accepted"));
    await instalar();
    expect(sePuedeInstalar(), "el botón tiene que desaparecer, no quedarse sin efecto").toBe(false);
    await expect(instalar()).resolves.toBe(false);
  });

  it("sin oferta no hace nada y no lanza", async () => {
    await expect(instalar()).resolves.toBe(false);
  });

  it("si el diálogo falla no rompe la aplicación", async () => {
    escucharInstalacion();
    const prompt = vi.fn().mockRejectedValue(new Error("sin gesto del usuario"));
    window.dispatchEvent(evento("accepted", prompt));
    await expect(instalar()).resolves.toBe(false);
  });

  it("cuando el sistema informa de la instalación, la oferta se retira", () => {
    escucharInstalacion();
    window.dispatchEvent(evento("accepted"));
    expect(sePuedeInstalar()).toBe(true);
    window.dispatchEvent(new Event("appinstalled"));
    expect(sePuedeInstalar()).toBe(false);
  });
});

describe("yaEstaInstalada", () => {
  it("es falso en una pestaña normal", () => {
    expect(yaEstaInstalada()).toBe(false);
  });

  it("detecta la ventana propia de una aplicación instalada", () => {
    const original = window.matchMedia;
    window.matchMedia = ((q: string) =>
      ({ matches: q.includes("standalone") })) as unknown as typeof window.matchMedia;
    expect(yaEstaInstalada()).toBe(true);
    window.matchMedia = original;
  });

  it("detecta también la forma propia de Safari en iPhone, que no implementa la estándar", () => {
    const original = window.matchMedia;
    window.matchMedia = ((): { matches: boolean } => ({ matches: false })) as unknown as typeof window.matchMedia;
    (window.navigator as { standalone?: boolean }).standalone = true;
    expect(yaEstaInstalada()).toBe(true);
    delete (window.navigator as { standalone?: boolean }).standalone;
    window.matchMedia = original;
  });
});
