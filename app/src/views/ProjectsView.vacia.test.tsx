// @vitest-environment happy-dom
/**
 * Respaldar cuando todavía no hay proyectos.
 *
 * El pie de la barra lateral ofrece «Respaldar en un archivo» y trae a esta pantalla. Con la cartera
 * vacía no había ningún botón de respaldo, así que quien dedicó su primer rato a poner los datos de
 * su negocio, sus precios por marca y su libreta de electricistas no tenía forma de guardarlos —y
 * esos datos se pierden al borrar el navegador exactamente igual que los proyectos.
 *
 * La regla que se fija: el botón aparece cuando hay ALGO que perder, no cuando hay proyectos.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import ProjectsView from "./ProjectsView";
import { guardarContactos } from "../lib/contactos";
import { guardarNegocio, NEGOCIO_VACIO, _olvidarNegocio } from "../lib/negocio";
import { guardarBosRates } from "../lib/bos";
import { guardarQuotes } from "../lib/quotes";

const props = {
  projects: [],
  onOpen: vi.fn(),
  onDelete: vi.fn(),
  onStatus: vi.fn(),
  onNew: vi.fn(),
  onImport: vi.fn(),
};

beforeEach(() => {
  localStorage.clear();
  _olvidarNegocio();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  _olvidarNegocio();
});

describe("la cartera vacía", () => {
  it("sin nada guardado no ofrece respaldar: no habría qué meter en el archivo", () => {
    render(<ProjectsView {...props} />);
    expect(screen.getByText(/Aún no tienes proyectos/)).toBeTruthy();
    expect(screen.queryByText(/Respaldar mis datos/)).toBeNull();
    // restaurar sí, porque es justo la pantalla de quien acaba de cambiar de equipo
    expect(screen.getByText(/Restaurar un respaldo/)).toBeTruthy();
  });

  it("con los datos del negocio puestos, ya se puede respaldar", () => {
    guardarNegocio({ ...NEGOCIO_VACIO, nombre: "Solar Norte" });
    render(<ProjectsView {...props} />);
    expect(screen.getByText(/Respaldar mis datos/)).toBeTruthy();
  });

  it("con precios por marca capturados, también", () => {
    guardarQuotes({ trina: 4.8 });
    render(<ProjectsView {...props} />);
    expect(screen.getByText(/Respaldar mis datos/)).toBeTruthy();
  });

  it("con el costo por watt de su operación, también", () => {
    guardarBosRates({ res: 14.5 });
    render(<ProjectsView {...props} />);
    expect(screen.getByText(/Respaldar mis datos/)).toBeTruthy();
  });

  it("el aviso del respaldo enumera lo que va en el archivo, sin decir «0 proyectos»", () => {
    guardarNegocio({ ...NEGOCIO_VACIO, nombre: "Solar Norte" });
    render(<ProjectsView {...props} />);
    fireEvent.click(screen.getByText(/Respaldar mis datos/));
    expect(screen.getByText(/Respaldo descargado con tus datos y tus precios/)).toBeTruthy();
    expect(screen.queryByText(/0 proyectos/)).toBeNull();
  });

  it("con la libreta empezada, también", () => {
    guardarContactos([
      { id: "c1", nombre: "Ing. Ana Ruiz", rol: "electricista", telefono: "", correo: "", registro: "", notas: "", creadoEn: 1767225600000 },
    ]);
    render(<ProjectsView {...props} />);
    expect(screen.getByText(/Respaldar mis datos/)).toBeTruthy();
  });
});
