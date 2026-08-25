// @vitest-environment happy-dom
/**
 * Notas de seguimiento en la cartera.
 *
 * El embudo decía en qué punto está cada trabajo y no POR QUÉ: «pidió financiamiento», «volver en
 * junio cuando quiten el árbol», «cotizar también la bomba». Esa mitad del seguimiento acababa en
 * una libreta de papel, fuera de la herramienta que lleva la cartera.
 *
 * Dos cosas se fijan aquí. Una, que la nota se pueda escribir y se guarde. Y otra que importa más:
 * que NO salga en la propuesta. Es una nota interna sobre el cliente, y hay notas que serían un
 * problema si el cliente las leyera en el documento que se le entrega.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import ProjectsView from "./ProjectsView";
import { MAX_NOTA, type Project } from "../lib/storage";
import { buildProposal } from "../lib/proposal";
import { CITIES, compute, type Design, type Panel } from "../lib/solar";

const panel: Panel = {
  brand: "Test", model: "T-550", w: 550, eff: 21.3, temp: -0.34, area: 2.58,
  voc: 49.9, vmp: 41.8, isc: 14.0, imp: 13.2, betaVoc: -0.125, ppw: 5.2,
  priceOrigin: "banda", warr: 25,
};

const ciudad = CITIES.guadalajara;
const design: Design = {
  site: ciudad.site, lat: ciudad.lat, lng: ciudad.lng, yield: ciudad.yield,
  area: 60, tilt: 24, az: 180, shade: 0, type: "res", panel,
};

const proyecto = (over: Partial<Project> = {}): Project => ({
  id: "p1", address: "Av. Chapultepec 100", city: "Guadalajara",
  design, createdAt: 1767225600000, status: "propuesta", ...over,
});

const props = {
  onOpen: vi.fn(),
  onDelete: vi.fn(),
  onStatus: vi.fn(),
  onNew: vi.fn(),
};

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("la nota de seguimiento", () => {
  it("invita a escribirla cuando no hay ninguna", () => {
    render(<ProjectsView {...props} projects={[proyecto()]} onNota={vi.fn()} />);
    expect(screen.getByText(/Agregar una nota/)).toBeTruthy();
  });

  it("muestra la nota guardada en la propia fila", () => {
    render(
      <ProjectsView {...props} projects={[proyecto({ nota: "Pidió financiamiento a 24 meses" })]} onNota={vi.fn()} />,
    );
    expect(screen.getByText(/Pidió financiamiento a 24 meses/)).toBeTruthy();
  });

  it("se escribe y se guarda al salir del campo", () => {
    const onNota = vi.fn();
    render(<ProjectsView {...props} projects={[proyecto()]} onNota={onNota} />);
    fireEvent.click(screen.getByText(/Agregar una nota/));
    const campo = screen.getByLabelText(/Nota de Av. Chapultepec 100/);
    fireEvent.change(campo, { target: { value: "Volver en junio" } });
    fireEvent.blur(campo);
    expect(onNota).toHaveBeenCalledWith("p1", "Volver en junio");
  });

  it("con Escape se cierra sin guardar", () => {
    const onNota = vi.fn();
    render(<ProjectsView {...props} projects={[proyecto()]} onNota={onNota} />);
    fireEvent.click(screen.getByText(/Agregar una nota/));
    const campo = screen.getByLabelText(/Nota de Av. Chapultepec 100/);
    fireEvent.change(campo, { target: { value: "algo que no quería escribir" } });
    fireEvent.keyDown(campo, { key: "Escape" });
    expect(onNota).not.toHaveBeenCalled();
  });

  it("abrir la nota no abre el proyecto", () => {
    // la fila entera es pulsable para abrir el análisis: sin detener la propagación, tocar la nota
    // se llevaba al instalador a otra pantalla
    const onOpen = vi.fn();
    render(<ProjectsView {...props} onOpen={onOpen} projects={[proyecto()]} onNota={vi.fn()} />);
    fireEvent.click(screen.getByText(/Agregar una nota/));
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("acota el largo, que el almacén del navegador es limitado", () => {
    render(<ProjectsView {...props} projects={[proyecto()]} onNota={vi.fn()} />);
    fireEvent.click(screen.getByText(/Agregar una nota/));
    expect(screen.getByLabelText(/Nota de/).getAttribute("maxlength")).toBe(String(MAX_NOTA));
  });

  it("sin manejador de notas la cartera funciona igual, sin el control", () => {
    render(<ProjectsView {...props} projects={[proyecto()]} />);
    expect(screen.queryByText(/Agregar una nota/)).toBeNull();
    expect(screen.getByText(/Av. Chapultepec 100/)).toBeTruthy();
  });
});

describe("la nota es interna", () => {
  it("no aparece en la propuesta que se entrega al cliente", () => {
    const nota = "El cliente regatea, no bajar de 18 MXN/Wp";
    const p = proyecto({ nota });
    const html = buildProposal(p.address, p.city, p.design, compute(p.design));
    expect(html, "una nota interna en el documento del cliente sería un problema").not.toContain(nota);
    expect(html).not.toMatch(/regatea/);
  });
});
