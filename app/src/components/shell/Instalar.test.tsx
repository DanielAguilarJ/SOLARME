// @vitest-environment happy-dom
/**
 * El botón de instalar en el dispositivo.
 *
 * Lo que se prueba es que NO aparezca cuando no sirve. Un botón «Instalar» que al pulsarse no hace
 * nada —porque el navegador nunca ofreció la instalación, como en Safari de iPhone— es peor que no
 * tener botón: el instalador lo intenta, no pasa nada, y deja de confiar en el resto.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import Sidebar from "./Sidebar";
import { _reiniciarInstalacion, escucharInstalacion } from "../../lib/instalacion";

const props = {
  view: "inicio" as const,
  onNavigate: vi.fn(),
  onNew: vi.fn(),
  onAviso: vi.fn(),
  projectCount: 0,
};

const ofrecer = () => {
  const prompt = vi.fn().mockResolvedValue(undefined);
  window.dispatchEvent(
    Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
      prompt,
      userChoice: Promise.resolve({ outcome: "accepted" as const }),
    }),
  );
  return prompt;
};

beforeEach(() => _reiniciarInstalacion());
afterEach(() => {
  cleanup();
  _reiniciarInstalacion();
});

describe("el botón de instalar", () => {
  it("no se pinta si el navegador no ofreció instalar", () => {
    render(<Sidebar {...props} />);
    expect(screen.queryByText(/Instalar en este dispositivo/)).toBeNull();
  });

  it("aparece cuando el navegador lo ofrece, sin recargar", () => {
    escucharInstalacion();
    render(<Sidebar {...props} />);
    expect(screen.queryByText(/Instalar en este dispositivo/)).toBeNull();
    // el aviso del navegador llega solo, sin interacción: React tiene que enterarse por la
    // suscripción, así que se envuelve en act para que procese la actualización
    act(() => void ofrecer());
    expect(screen.getByText(/Instalar en este dispositivo/)).toBeTruthy();
  });

  it("al pulsarlo abre el diálogo del sistema y luego se retira", async () => {
    escucharInstalacion();
    const prompt = ofrecer();
    render(<Sidebar {...props} />);
    fireEvent.click(screen.getByText(/Instalar en este dispositivo/));
    expect(prompt).toHaveBeenCalled();
    // la oferta se consume: el botón desaparece en vez de quedarse sin efecto
    await vi.waitFor(() => expect(screen.queryByText(/Instalar en este dispositivo/)).toBeNull());
  });

  it("el pie sigue diciendo dónde vive el trabajo y cómo respaldarlo", () => {
    // el botón nuevo no puede haber desplazado lo que ya estaba
    render(<Sidebar {...props} />);
    expect(screen.getByText(/Sólo en este navegador/)).toBeTruthy();
    expect(screen.getByText(/Respaldar en un archivo/)).toBeTruthy();
    expect(screen.getByText(/Aviso de privacidad/)).toBeTruthy();
  });
});
