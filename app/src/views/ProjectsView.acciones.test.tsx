// @vitest-environment happy-dom
/**
 * Corregir el domicilio y duplicar un proyecto.
 *
 * Los dos huecos venían del mismo sitio: la cartera solo dejaba abrir, marcar estado y borrar. Un
 * domicilio mal tecleado —el texto que sale impreso en la propuesta que lee el cliente— obligaba a
 * borrar el proyecto y volver a trazar el techo. Y para presentar dos escenarios al mismo cliente
 * («con 10 módulos o con 14») había que empezar de cero desde la dirección.
 *
 * La regla que se fija con más cuidado: al corregir el domicilio, la CIUDAD no cambia. De ella salen
 * el rendimiento medido y las temperaturas del dimensionado; dejar la física de Guadalajara con el
 * nombre de Monterrey sería un error mucho peor que el de tecleo que se venía a corregir.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import ProjectsView from "./ProjectsView";
import { duplicarProyecto, MAX_NOTA, type Project } from "../lib/storage";
import { CITIES, type Design, type Panel } from "../lib/solar";

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

const base = { onOpen: vi.fn(), onDelete: vi.fn(), onStatus: vi.fn(), onNew: vi.fn() };

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("corregir el domicilio", () => {
  it("se abre con el lápiz y guarda al salir del campo", () => {
    const onDomicilio = vi.fn();
    render(<ProjectsView {...base} projects={[proyecto()]} onDomicilio={onDomicilio} />);
    fireEvent.click(screen.getByLabelText(/Corregir el domicilio/));
    const campo = screen.getByLabelText(/Domicilio de Av. Chapultepec 100/);
    fireEvent.change(campo, { target: { value: "Av. Chapultepec Sur 480" } });
    fireEvent.blur(campo);
    expect(onDomicilio).toHaveBeenCalledWith("p1", "Av. Chapultepec Sur 480");
  });

  it("con Enter también guarda, que es lo que espera cualquiera", () => {
    const onDomicilio = vi.fn();
    render(<ProjectsView {...base} projects={[proyecto()]} onDomicilio={onDomicilio} />);
    fireEvent.click(screen.getByLabelText(/Corregir el domicilio/));
    const campo = screen.getByLabelText(/Domicilio de/);
    fireEvent.change(campo, { target: { value: "Calle Nueva 1" } });
    fireEvent.keyDown(campo, { key: "Enter" });
    expect(onDomicilio).toHaveBeenCalledWith("p1", "Calle Nueva 1");
  });

  it("con Escape se cierra sin guardar", () => {
    const onDomicilio = vi.fn();
    render(<ProjectsView {...base} projects={[proyecto()]} onDomicilio={onDomicilio} />);
    fireEvent.click(screen.getByLabelText(/Corregir el domicilio/));
    const campo = screen.getByLabelText(/Domicilio de/);
    fireEvent.change(campo, { target: { value: "no" } });
    fireEvent.keyDown(campo, { key: "Escape" });
    expect(onDomicilio).not.toHaveBeenCalled();
  });

  it("editar no abre el proyecto", () => {
    const onOpen = vi.fn();
    render(<ProjectsView {...base} onOpen={onOpen} projects={[proyecto()]} onDomicilio={vi.fn()} />);
    fireEvent.click(screen.getByLabelText(/Corregir el domicilio/));
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("la ciudad no se puede editar aquí: de ella depende la física", () => {
    render(<ProjectsView {...base} projects={[proyecto()]} onDomicilio={vi.fn()} />);
    fireEvent.click(screen.getByLabelText(/Corregir el domicilio/));
    expect(screen.queryByLabelText(/Ciudad/)).toBeNull();
    // y la ciudad sigue mostrándose como dato, no como campo
    expect(screen.getByText("Guadalajara")).toBeTruthy();
  });

  it("sin manejador no aparece el lápiz", () => {
    render(<ProjectsView {...base} projects={[proyecto()]} />);
    expect(screen.queryByLabelText(/Corregir el domicilio/)).toBeNull();
  });
});

describe("duplicar un proyecto", () => {
  it("el botón pide duplicar ese proyecto", () => {
    const onDuplicar = vi.fn();
    render(<ProjectsView {...base} projects={[proyecto()]} onDuplicar={onDuplicar} />);
    fireEvent.click(screen.getByLabelText(/Duplicar Av. Chapultepec 100/));
    expect(onDuplicar).toHaveBeenCalledWith("p1");
  });

  it("duplicar no abre el proyecto", () => {
    const onOpen = vi.fn();
    render(<ProjectsView {...base} onOpen={onOpen} projects={[proyecto()]} onDuplicar={vi.fn()} />);
    fireEvent.click(screen.getByLabelText(/Duplicar/));
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("sin manejador no aparece el botón", () => {
    render(<ProjectsView {...base} projects={[proyecto()]} />);
    expect(screen.queryByLabelText(/Duplicar/)).toBeNull();
  });
});

describe("el encabezado no deja leer dos veces el mismo dinero", () => {
  it("con dos escenarios del mismo techo dice cuántos domicilios hay", () => {
    const a = proyecto({ id: "p1" });
    const b = proyecto({ id: "p2", nota: "Escenario alterno" });
    render(<ProjectsView {...base} projects={[a, b]} />);
    expect(screen.getByText(/2 análisis/)).toBeTruthy();
    expect(screen.getByText(/de 1 domicilio/)).toBeTruthy();
  });

  it("con domicilios distintos no añade ruido", () => {
    const a = proyecto({ id: "p1" });
    const b = proyecto({ id: "p2", address: "Calle Morelos 45", city: "Puebla" });
    render(<ProjectsView {...base} projects={[a, b]} />);
    expect(screen.queryByText(/de \d+ domicilios?/)).toBeNull();
  });
});

describe("duplicarProyecto", () => {
  it("conserva el techo, el módulo y los ajustes: es el mismo trabajo", () => {
    const copia = duplicarProyecto(proyecto(), "p2", 1800000000000);
    expect(copia.design).toEqual(design);
    expect(copia.address).toBe("Av. Chapultepec 100");
    expect(copia.city).toBe("Guadalajara");
  });

  it("es un proyecto distinto, con su propia fecha", () => {
    const copia = duplicarProyecto(proyecto(), "p2", 1800000000000);
    expect(copia.id).toBe("p2");
    expect(copia.createdAt).toBe(1800000000000);
  });

  it("arranca como borrador aunque el original ya fuera una propuesta entregada", () => {
    // si heredara el estado, el embudo contaría como mandada una propuesta que nadie ha visto
    expect(duplicarProyecto(proyecto({ status: "propuesta" }), "p2").status).toBe("borrador");
    expect(duplicarProyecto(proyecto({ status: "ganado" }), "p2").status).toBe("borrador");
  });

  it("se distingue en la lista: la nota dice que es un escenario alterno", () => {
    expect(duplicarProyecto(proyecto(), "p2").nota).toBe("Escenario alterno");
  });

  it("conserva la nota del original detrás de la marca", () => {
    const copia = duplicarProyecto(proyecto({ nota: "Pidió financiamiento" }), "p2");
    expect(copia.nota).toBe("Escenario alterno · Pidió financiamiento");
  });

  it("no rebasa el tope de la nota al añadir la marca", () => {
    const copia = duplicarProyecto(proyecto({ nota: "x".repeat(MAX_NOTA) }), "p2");
    expect(copia.nota!.length).toBe(MAX_NOTA);
  });

  it("no toca el original", () => {
    const original = proyecto({ nota: "algo" });
    duplicarProyecto(original, "p2");
    expect(original.id).toBe("p1");
    expect(original.status).toBe("propuesta");
    expect(original.nota).toBe("algo");
  });
});
